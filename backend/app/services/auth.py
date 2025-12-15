"""Serviço de autenticação e autorização."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Optional

import bcrypt
import jwt
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AuditLog, PasswordResetToken, Permission, Role, User, UserSession

# Configurações JWT
JWT_SECRET = settings.secret_key
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30


# =============================================================================
# FUNÇÕES DE HASH
# =============================================================================

def hash_password(password: str) -> str:
    """Gera hash bcrypt da senha."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verifica se a senha corresponde ao hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def hash_token(token: str) -> str:
    """Gera hash SHA-256 de um token."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_token() -> str:
    """Gera um token aleatório seguro."""
    return secrets.token_urlsafe(32)


# =============================================================================
# FUNÇÕES JWT
# =============================================================================

def create_access_token(user_id: int, role_name: str, permissions: list[str]) -> str:
    """Cria um access token JWT."""
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role_name,
        "permissions": permissions,
        "type": "access",
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: int, session_id: int) -> str:
    """Cria um refresh token JWT."""
    expire = datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "session_id": session_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decodifica e valida um token JWT."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# =============================================================================
# SERVIÇO DE AUTENTICAÇÃO
# =============================================================================

class AuthService:
    """Serviço para operações de autenticação."""

    def __init__(self, db: Session):
        self.db = db

    def authenticate(self, email: str, password: str) -> Optional[User]:
        """Autentica um usuário por email e senha."""
        user = self.db.query(User).filter(
            User.email == email.lower(),
            User.is_active == True
        ).first()
        
        if not user:
            return None
        
        if not verify_password(password, user.password_hash):
            return None
        
        return user

    def create_session(
        self,
        user: User,
        device_info: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> tuple[str, str]:
        """
        Cria uma nova sessão para o usuário.
        
        Retorna: (access_token, refresh_token)
        """
        # Gera refresh token
        refresh_token = generate_token()
        
        # Cria sessão no banco
        session = UserSession(
            user_id=user.id,
            refresh_token_hash=hash_token(refresh_token),
            device_info=device_info,
            ip_address=ip_address,
            expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )
        self.db.add(session)
        self.db.flush()
        
        # Atualiza último login
        user.last_login = datetime.now(UTC)
        
        # Gera tokens
        permissions = [p.code for p in user.role.permissions] if user.role else []
        access_token = create_access_token(user.id, user.role.name if user.role else "viewer", permissions)
        refresh_token_jwt = create_refresh_token(user.id, session.id)
        
        self.db.commit()
        
        return access_token, refresh_token_jwt

    def refresh_session(self, refresh_token: str) -> Optional[tuple[str, str]]:
        """
        Renova uma sessão usando o refresh token.
        
        Retorna: (new_access_token, new_refresh_token) ou None se inválido
        """
        # Decodifica o token
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            return None
        
        session_id = payload.get("session_id")
        user_id = int(payload.get("sub", 0))
        
        # Busca sessão
        session = self.db.query(UserSession).filter(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.is_active == True
        ).first()
        
        if not session or session.expires_at < datetime.now(UTC):
            return None
        
        # Busca usuário
        user = self.db.get(User, user_id)
        if not user or not user.is_active:
            return None
        
        # Gera novo refresh token
        new_refresh_token = generate_token()
        session.refresh_token_hash = hash_token(new_refresh_token)
        session.last_used_at = datetime.now(UTC)
        session.expires_at = datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        
        # Gera novos tokens
        permissions = [p.code for p in user.role.permissions] if user.role else []
        access_token = create_access_token(user.id, user.role.name if user.role else "viewer", permissions)
        refresh_token_jwt = create_refresh_token(user.id, session.id)
        
        self.db.commit()
        
        return access_token, refresh_token_jwt

    def logout(self, session_id: int, user_id: int) -> bool:
        """Invalida uma sessão específica."""
        session = self.db.query(UserSession).filter(
            UserSession.id == session_id,
            UserSession.user_id == user_id
        ).first()
        
        if session:
            session.is_active = False
            self.db.commit()
            return True
        return False

    def logout_all(self, user_id: int) -> int:
        """Invalida todas as sessões de um usuário."""
        result = self.db.query(UserSession).filter(
            UserSession.user_id == user_id,
            UserSession.is_active == True
        ).update({"is_active": False})
        self.db.commit()
        return result

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Busca usuário por ID."""
        return self.db.query(User).filter(
            User.id == user_id,
            User.is_active == True
        ).first()

    def create_user(
        self,
        email: str,
        password: str,
        nome: str,
        role_id: int,
        telefone: Optional[str] = None,
        is_verified: bool = False
    ) -> User:
        """Cria um novo usuário."""
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            nome=nome,
            telefone=telefone,
            role_id=role_id,
            is_verified=is_verified
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_password(self, user: User, new_password: str) -> None:
        """Atualiza a senha do usuário."""
        user.password_hash = hash_password(new_password)
        self.db.commit()

    def create_password_reset_token(self, user: User) -> str:
        """Cria um token de recuperação de senha."""
        token = generate_token()
        
        # Invalida tokens anteriores
        self.db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.is_used == False
        ).update({"is_used": True})
        
        # Cria novo token
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(hours=1)
        )
        self.db.add(reset_token)
        self.db.commit()
        
        return token

    def verify_password_reset_token(self, token: str) -> Optional[User]:
        """Verifica um token de recuperação de senha."""
        token_hash = hash_token(token)
        
        reset_token = self.db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.is_used == False,
            PasswordResetToken.expires_at > datetime.now(UTC)
        ).first()
        
        if not reset_token:
            return None
        
        return self.db.get(User, reset_token.user_id)

    def use_password_reset_token(self, token: str) -> bool:
        """Marca um token de recuperação como usado."""
        token_hash = hash_token(token)
        
        result = self.db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == token_hash
        ).update({"is_used": True})
        
        self.db.commit()
        return result > 0


# =============================================================================
# SERVIÇO DE AUDITORIA
# =============================================================================

class AuditService:
    """Serviço para logs de auditoria."""

    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        action: str,
        user_id: Optional[int] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> AuditLog:
        """Registra uma ação no log de auditoria."""
        log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )
        self.db.add(log)
        self.db.commit()
        return log


# =============================================================================
# SEED DE DADOS INICIAIS
# =============================================================================

def seed_roles_and_permissions(db: Session) -> None:
    """Cria roles e permissões padrão do sistema."""
    
    # Verifica se já existe
    if db.query(Role).first():
        return
    
    # Permissões por módulo
    permissions_data = [
        # Usuários
        ("users.view", "Ver Usuários", "Visualizar lista de usuários", "users"),
        ("users.create", "Criar Usuários", "Criar novos usuários", "users"),
        ("users.edit", "Editar Usuários", "Editar usuários existentes", "users"),
        ("users.delete", "Excluir Usuários", "Excluir usuários", "users"),
        ("users.manage_roles", "Gerenciar Papéis", "Atribuir papéis a usuários", "users"),
        
        # Cupons
        ("receipts.view", "Ver Cupons", "Visualizar cupons fiscais", "receipts"),
        ("receipts.import", "Importar Cupons", "Importar novos cupons", "receipts"),
        ("receipts.delete", "Excluir Cupons", "Excluir cupons", "receipts"),
        
        # Lojas
        ("stores.view", "Ver Lojas", "Visualizar lojas", "stores"),
        ("stores.edit", "Editar Lojas", "Editar dados de lojas", "stores"),
        ("stores.delete", "Excluir Lojas", "Excluir lojas", "stores"),
        
        # Produtos
        ("products.view", "Ver Produtos", "Visualizar produtos", "products"),
        ("products.edit", "Editar Produtos", "Editar produtos canônicos", "products"),
        ("products.delete", "Excluir Produtos", "Excluir produtos", "products"),
        ("products.normalize", "Normalizar Produtos", "Executar normalização de produtos", "products"),
        
        # Preços
        ("prices.view", "Ver Preços", "Visualizar histórico de preços", "prices"),
        
        # Relatórios
        ("reports.view", "Ver Relatórios", "Acessar relatórios e estatísticas", "reports"),
        ("reports.export", "Exportar Relatórios", "Exportar dados em CSV/Excel", "reports"),
        
        # Sistema
        ("system.settings", "Configurações", "Acessar configurações do sistema", "system"),
        ("system.audit", "Logs de Auditoria", "Visualizar logs de auditoria", "system"),
    ]
    
    # Cria permissões
    permissions = {}
    for code, name, description, module in permissions_data:
        perm = Permission(code=code, name=name, description=description, module=module)
        db.add(perm)
        permissions[code] = perm
    
    db.flush()
    
    # Roles com suas permissões
    roles_data = [
        (
            "super_admin",
            "Super Administrador",
            "Acesso total ao sistema",
            True,
            100,
            list(permissions.keys())  # Todas as permissões
        ),
        (
            "admin",
            "Administrador",
            "Gerencia usuários e configurações",
            True,
            80,
            [p for p in permissions.keys() if not p.startswith("system.")]
        ),
        (
            "manager",
            "Gerente",
            "Gerencia operações do dia-a-dia",
            True,
            50,
            [
                "receipts.view", "receipts.import",
                "stores.view", "stores.edit",
                "products.view", "products.edit", "products.normalize",
                "prices.view",
                "reports.view", "reports.export",
            ]
        ),
        (
            "viewer",
            "Visualizador",
            "Apenas visualização",
            True,
            10,
            [
                "receipts.view",
                "stores.view",
                "products.view",
                "prices.view",
                "reports.view",
            ]
        ),
    ]
    
    for name, display_name, description, is_system, level, perm_codes in roles_data:
        role = Role(
            name=name,
            display_name=display_name,
            description=description,
            is_system=is_system,
            level=level
        )
        role.permissions = [permissions[code] for code in perm_codes if code in permissions]
        db.add(role)
    
    db.commit()


def create_initial_admin(db: Session, email: str, password: str, nome: str) -> Optional[User]:
    """Cria o primeiro usuário administrador."""
    
    # Verifica se já existe algum usuário
    if db.query(User).first():
        return None
    
    # Busca role super_admin
    role = db.query(Role).filter(Role.name == "super_admin").first()
    if not role:
        seed_roles_and_permissions(db)
        role = db.query(Role).filter(Role.name == "super_admin").first()
    
    if not role:
        return None
    
    # Cria usuário
    user = User(
        email=email.lower(),
        password_hash=hash_password(password),
        nome=nome,
        role_id=role.id,
        is_verified=True,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user
