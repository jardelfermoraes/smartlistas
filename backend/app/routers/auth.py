"""Router para autenticação e gerenciamento de usuários."""

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..database import DbSession
from ..models import Permission, Role, User
from ..services.auth import (
    AuthService,
    AuditService,
    decode_token,
    seed_roles_and_permissions,
    create_initial_admin,
)

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
security = HTTPBearer(auto_error=False)


# =============================================================================
# SCHEMAS
# =============================================================================

class LoginRequest(BaseModel):
    """Schema para login."""
    email: EmailStr
    password: str = Field(..., min_length=6)


class LoginResponse(BaseModel):
    """Schema de resposta do login."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RefreshRequest(BaseModel):
    """Schema para refresh de token."""
    refresh_token: str


class TokenResponse(BaseModel):
    """Schema de resposta com tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    """Schema de saída para usuário."""
    id: int
    email: str
    nome: str
    telefone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    is_verified: bool
    role: "RoleOut"
    permissions: List[str]

    class Config:
        from_attributes = True


class RoleOut(BaseModel):
    """Schema de saída para role."""
    id: int
    name: str
    display_name: str
    level: int

    class Config:
        from_attributes = True


class PermissionOut(BaseModel):
    """Schema de saída para permissão."""
    id: int
    code: str
    name: str
    description: Optional[str] = None
    module: str

    class Config:
        from_attributes = True


class RoleFullOut(BaseModel):
    """Schema completo de role com permissões."""
    id: int
    name: str
    display_name: str
    description: Optional[str] = None
    level: int
    is_system: bool
    permissions: List[PermissionOut]

    class Config:
        from_attributes = True


class UpdateRolePermissions(BaseModel):
    """Schema para atualizar permissões de uma role."""
    permission_ids: List[int]


class UserCreate(BaseModel):
    """Schema para criação de usuário."""
    email: EmailStr
    password: str = Field(..., min_length=6)
    nome: str = Field(..., min_length=2)
    telefone: Optional[str] = None
    role_id: int


class UserUpdate(BaseModel):
    """Schema para atualização de usuário."""
    nome: Optional[str] = None
    telefone: Optional[str] = None
    is_active: Optional[bool] = None
    role_id: Optional[int] = None


class PasswordChange(BaseModel):
    """Schema para alteração de senha."""
    current_password: str
    new_password: str = Field(..., min_length=6)


class PasswordResetRequest(BaseModel):
    """Schema para solicitar reset de senha."""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Schema para confirmar reset de senha."""
    token: str
    new_password: str = Field(..., min_length=6)


class SetupRequest(BaseModel):
    """Schema para setup inicial."""
    email: EmailStr
    password: str = Field(..., min_length=8)
    nome: str = Field(..., min_length=2)


# Update forward references
LoginResponse.model_rebuild()
UserOut.model_rebuild()


# =============================================================================
# DEPENDÊNCIAS
# =============================================================================

def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: DbSession = None
) -> User:
    """Obtém o usuário atual a partir do token JWT."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação não fornecido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = int(payload.get("sub", 0))
    auth_service = AuthService(db)
    user = auth_service.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado ou inativo",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: DbSession = None
) -> Optional[User]:
    """Obtém o usuário atual se autenticado, ou None."""
    if not credentials:
        return None
    
    try:
        payload = decode_token(credentials.credentials)
        if not payload or payload.get("type") != "access":
            return None
        
        user_id = int(payload.get("sub", 0))
        auth_service = AuthService(db)
        return auth_service.get_user_by_id(user_id)
    except Exception:
        return None


def require_permission(*permissions: str):
    """Decorator factory para verificar permissões."""
    def permission_checker(user: User = Depends(get_current_user)) -> User:
        if not user.has_any_permission(*permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissão negada"
            )
        return user
    return permission_checker


# =============================================================================
# ENDPOINTS DE AUTENTICAÇÃO
# =============================================================================

@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(request: Request, data: LoginRequest, db: DbSession):
    """Autentica um usuário e retorna tokens."""
    auth_service = AuthService(db)
    audit_service = AuditService(db)
    
    user = auth_service.authenticate(data.email, data.password)
    
    if not user:
        audit_service.log(
            action="login_failed",
            details=json.dumps({"email": data.email}),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent")
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )
    
    # Cria sessão
    access_token, refresh_token = auth_service.create_session(
        user=user,
        device_info=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None
    )
    
    # Log de auditoria
    audit_service.log(
        action="login",
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    # Monta resposta
    permissions = [p.code for p in user.role.permissions] if user.role else []
    
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut(
            id=user.id,
            email=user.email,
            nome=user.nome,
            telefone=user.telefone,
            avatar_url=user.avatar_url,
            is_active=user.is_active,
            is_verified=user.is_verified,
            role=RoleOut(
                id=user.role.id,
                name=user.role.name,
                display_name=user.role.display_name,
                level=user.role.level
            ) if user.role else None,
            permissions=permissions
        )
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh_token(request: Request, data: RefreshRequest, db: DbSession):
    """Renova os tokens usando o refresh token."""
    auth_service = AuthService(db)
    
    result = auth_service.refresh_session(data.refresh_token)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido ou expirado"
        )
    
    access_token, new_refresh_token = result
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token
    )


@router.post("/logout")
def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: DbSession = None
):
    """Encerra a sessão atual."""
    if not credentials:
        return {"message": "Logout realizado"}
    
    payload = decode_token(credentials.credentials)
    if payload and payload.get("type") == "refresh":
        session_id = payload.get("session_id")
        user_id = int(payload.get("sub", 0))
        
        auth_service = AuthService(db)
        auth_service.logout(session_id, user_id)
        
        # Log de auditoria
        audit_service = AuditService(db)
        audit_service.log(
            action="logout",
            user_id=user_id,
            ip_address=request.client.host if request.client else None
        )
    
    return {"message": "Logout realizado"}


@router.post("/logout-all")
def logout_all(
    request: Request,
    db: DbSession,
    user: User = Depends(get_current_user)
):
    """Encerra todas as sessões do usuário."""
    auth_service = AuthService(db)
    count = auth_service.logout_all(user.id)
    
    # Log de auditoria
    audit_service = AuditService(db)
    audit_service.log(
        action="logout_all",
        user_id=user.id,
        details=json.dumps({"sessions_invalidated": count}),
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": f"{count} sessões encerradas"}


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    """Retorna os dados do usuário autenticado."""
    permissions = [p.code for p in user.role.permissions] if user.role else []
    
    return UserOut(
        id=user.id,
        email=user.email,
        nome=user.nome,
        telefone=user.telefone,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        is_verified=user.is_verified,
        role=RoleOut(
            id=user.role.id,
            name=user.role.name,
            display_name=user.role.display_name,
            level=user.role.level
        ) if user.role else None,
        permissions=permissions
    )


@router.put("/me/password")
def change_password(
    data: PasswordChange,
    db: DbSession,
    user: User = Depends(get_current_user)
):
    """Altera a senha do usuário autenticado."""
    auth_service = AuthService(db)
    
    # Verifica senha atual
    if not auth_service.authenticate(user.email, data.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta"
        )
    
    # Atualiza senha
    auth_service.update_password(user, data.new_password)
    
    # Log de auditoria
    audit_service = AuditService(db)
    audit_service.log(
        action="password_changed",
        user_id=user.id
    )
    
    return {"message": "Senha alterada com sucesso"}


# =============================================================================
# ENDPOINTS DE GERENCIAMENTO DE USUÁRIOS
# =============================================================================

@router.get("/users", response_model=List[UserOut])
def list_users(
    db: DbSession,
    user: User = Depends(require_permission("users.view"))
):
    """Lista todos os usuários."""
    users = db.query(User).order_by(User.nome).all()
    
    result = []
    for u in users:
        permissions = [p.code for p in u.role.permissions] if u.role else []
        result.append(UserOut(
            id=u.id,
            email=u.email,
            nome=u.nome,
            telefone=u.telefone,
            avatar_url=u.avatar_url,
            is_active=u.is_active,
            is_verified=u.is_verified,
            role=RoleOut(
                id=u.role.id,
                name=u.role.name,
                display_name=u.role.display_name,
                level=u.role.level
            ) if u.role else None,
            permissions=permissions
        ))
    
    return result


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    request: Request,
    data: UserCreate,
    db: DbSession,
    current_user: User = Depends(require_permission("users.create"))
):
    """Cria um novo usuário."""
    # Verifica se email já existe
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email já cadastrado"
        )
    
    # Verifica se role existe
    role = db.get(Role, data.role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role não encontrada"
        )
    
    # Verifica se pode atribuir essa role (não pode criar usuário com nível maior)
    if current_user.role and role.level > current_user.role.level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível criar usuário com nível superior ao seu"
        )
    
    # Cria usuário
    auth_service = AuthService(db)
    user = auth_service.create_user(
        email=data.email,
        password=data.password,
        nome=data.nome,
        telefone=data.telefone,
        role_id=data.role_id
    )
    
    # Log de auditoria
    audit_service = AuditService(db)
    audit_service.log(
        action="user_created",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(user.id),
        ip_address=request.client.host if request.client else None
    )
    
    permissions = [p.code for p in user.role.permissions] if user.role else []
    
    return UserOut(
        id=user.id,
        email=user.email,
        nome=user.nome,
        telefone=user.telefone,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        is_verified=user.is_verified,
        role=RoleOut(
            id=user.role.id,
            name=user.role.name,
            display_name=user.role.display_name,
            level=user.role.level
        ) if user.role else None,
        permissions=permissions
    )


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    request: Request,
    user_id: int,
    data: UserUpdate,
    db: DbSession,
    current_user: User = Depends(require_permission("users.edit"))
):
    """Atualiza um usuário."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Não pode editar usuário de nível superior
    if current_user.role and user.role and user.role.level > current_user.role.level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível editar usuário com nível superior ao seu"
        )
    
    # Atualiza campos
    if data.nome is not None:
        user.nome = data.nome
    if data.telefone is not None:
        user.telefone = data.telefone
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.role_id is not None:
        new_role = db.get(Role, data.role_id)
        if not new_role:
            raise HTTPException(status_code=400, detail="Role não encontrada")
        if current_user.role and new_role.level > current_user.role.level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Não é possível atribuir role com nível superior ao seu"
            )
        user.role_id = data.role_id
    
    db.commit()
    db.refresh(user)
    
    # Log de auditoria
    audit_service = AuditService(db)
    audit_service.log(
        action="user_updated",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(user_id),
        ip_address=request.client.host if request.client else None
    )
    
    permissions = [p.code for p in user.role.permissions] if user.role else []
    
    return UserOut(
        id=user.id,
        email=user.email,
        nome=user.nome,
        telefone=user.telefone,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        is_verified=user.is_verified,
        role=RoleOut(
            id=user.role.id,
            name=user.role.name,
            display_name=user.role.display_name,
            level=user.role.level
        ) if user.role else None,
        permissions=permissions
    )


@router.delete("/users/{user_id}")
def delete_user(
    request: Request,
    user_id: int,
    db: DbSession,
    current_user: User = Depends(require_permission("users.delete"))
):
    """Desativa um usuário (soft delete)."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível excluir a si mesmo"
        )
    
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Não pode deletar usuário de nível superior
    if current_user.role and user.role and user.role.level > current_user.role.level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível excluir usuário com nível superior ao seu"
        )
    
    user.is_active = False
    db.commit()
    
    # Log de auditoria
    audit_service = AuditService(db)
    audit_service.log(
        action="user_deleted",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(user_id),
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": "Usuário desativado"}


# =============================================================================
# ENDPOINTS DE ROLES
# =============================================================================

@router.get("/roles", response_model=List[RoleOut])
def list_roles(db: DbSession, user: User = Depends(get_current_user)):
    """Lista todas as roles disponíveis."""
    roles = db.query(Role).order_by(Role.level.desc()).all()
    return [
        RoleOut(
            id=r.id,
            name=r.name,
            display_name=r.display_name,
            level=r.level
        )
        for r in roles
    ]


@router.get("/roles/full", response_model=List[RoleFullOut])
def list_roles_full(db: DbSession, user: User = Depends(require_permission("users.manage_roles"))):
    """Lista todas as roles com suas permissões."""
    roles = db.query(Role).order_by(Role.level.desc()).all()
    return [
        RoleFullOut(
            id=r.id,
            name=r.name,
            display_name=r.display_name,
            description=r.description,
            level=r.level,
            is_system=r.is_system,
            permissions=[
                PermissionOut(
                    id=p.id,
                    code=p.code,
                    name=p.name,
                    description=p.description,
                    module=p.module
                )
                for p in r.permissions
            ]
        )
        for r in roles
    ]


@router.put("/roles/{role_id}/permissions")
def update_role_permissions(
    request: Request,
    role_id: int,
    data: UpdateRolePermissions,
    db: DbSession,
    current_user: User = Depends(require_permission("users.manage_roles"))
):
    """Atualiza as permissões de uma role."""
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role não encontrada")
    
    # Não pode editar role de nível superior
    if current_user.role and role.level > current_user.role.level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível editar role com nível superior ao seu"
        )
    
    # Busca as permissões
    permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all()
    
    # Atualiza
    role.permissions = permissions
    db.commit()
    
    # Log de auditoria
    audit_service = AuditService(db)
    audit_service.log(
        action="role_permissions_updated",
        user_id=current_user.id,
        resource_type="role",
        resource_id=str(role_id),
        details=json.dumps({"permissions": [p.code for p in permissions]}),
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": "Permissões atualizadas", "count": len(permissions)}


@router.get("/permissions", response_model=List[PermissionOut])
def list_permissions(db: DbSession, user: User = Depends(require_permission("users.manage_roles"))):
    """Lista todas as permissões disponíveis."""
    permissions = db.query(Permission).order_by(Permission.module, Permission.code).all()
    return [
        PermissionOut(
            id=p.id,
            code=p.code,
            name=p.name,
            description=p.description,
            module=p.module
        )
        for p in permissions
    ]


# =============================================================================
# SETUP INICIAL
# =============================================================================

@router.get("/setup/status")
def setup_status(db: DbSession):
    """Verifica se o sistema precisa de setup inicial."""
    has_users = db.query(User).first() is not None
    has_roles = db.query(Role).first() is not None
    
    return {
        "needs_setup": not has_users,
        "has_roles": has_roles,
        "has_users": has_users
    }


@router.post("/setup")
@limiter.limit("3/minute")
def setup(request: Request, data: SetupRequest, db: DbSession):
    """Configura o primeiro usuário administrador."""
    # Verifica se já existe usuário
    if db.query(User).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sistema já configurado"
        )
    
    # Cria roles e permissões
    seed_roles_and_permissions(db)
    
    # Cria admin
    user = create_initial_admin(db, data.email, data.password, data.nome)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao criar usuário administrador"
        )
    
    # Log de auditoria
    audit_service = AuditService(db)
    audit_service.log(
        action="system_setup",
        user_id=user.id,
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": "Sistema configurado com sucesso", "user_id": user.id}
