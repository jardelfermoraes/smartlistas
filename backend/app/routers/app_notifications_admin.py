from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from redis import Redis
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AppUser, AppUserSession, User
from .auth import get_current_user

router = APIRouter()

RULES_KEY = "smartlistas.notification_rules.v1"
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def _normalize_optional_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = str(value).strip()
    return v or None


class AudienceFilter(BaseModel):
    state: Optional[str] = Field(default=None, max_length=2)
    city: Optional[str] = Field(default=None, max_length=120)
    gender: Optional[str] = Field(default=None, max_length=20)


class AudienceCountOut(BaseModel):
    user_count: int
    token_count: int


class SendNotificationIn(BaseModel):
    title: str = Field(..., max_length=120)
    body: str = Field(default="", max_length=2000)
    data: Optional[Dict[str, Any]] = None
    filters: Optional[AudienceFilter] = None


class SendNotificationOut(BaseModel):
    requested_tokens: int
    sent: int
    failures: int


RuleTrigger = Literal[
    "manual",
    "price_drop",
    "inactivity",
    "weekly_summary",
    "custom",
]


class NotificationRule(BaseModel):
    id: str
    name: str
    enabled: bool = True
    trigger: RuleTrigger = "custom"
    filters: AudienceFilter = Field(default_factory=AudienceFilter)
    title: str = Field(..., max_length=120)
    body: str = Field(default="", max_length=2000)
    data: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class NotificationRuleCreateIn(BaseModel):
    name: str = Field(..., max_length=120)
    enabled: bool = True
    trigger: RuleTrigger = "custom"
    filters: AudienceFilter = Field(default_factory=AudienceFilter)
    title: str = Field(..., max_length=120)
    body: str = Field(default="", max_length=2000)
    data: Optional[Dict[str, Any]] = None


class NotificationRuleUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    enabled: Optional[bool] = None
    trigger: Optional[RuleTrigger] = None
    filters: Optional[AudienceFilter] = None
    title: Optional[str] = Field(default=None, max_length=120)
    body: Optional[str] = Field(default=None, max_length=2000)
    data: Optional[Dict[str, Any]] = None


def _read_rules(r: Redis) -> List[NotificationRule]:
    raw = r.get(RULES_KEY)
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return []
        out: List[NotificationRule] = []
        for it in parsed:
            try:
                out.append(NotificationRule.model_validate(it))
            except Exception:
                continue
        return out
    except Exception:
        return []


def _write_rules(r: Redis, rules: List[NotificationRule]) -> None:
    payload = [rule.model_dump(mode="json") for rule in rules]
    r.set(RULES_KEY, json.dumps(payload, ensure_ascii=False))


def _apply_filters(q, f: Optional[AudienceFilter]):
    if not f:
        return q

    state = _normalize_optional_str(f.state)
    city = _normalize_optional_str(f.city)
    gender = _normalize_optional_str(f.gender)

    if state:
        q = q.filter(func.lower(AppUser.state) == state.lower())
    if city:
        q = q.filter(func.lower(AppUser.city) == city.lower())
    if gender:
        q = q.filter(func.lower(AppUser.gender) == gender.lower())
    return q


def _get_audience_tokens(db: Session, f: Optional[AudienceFilter]) -> List[str]:
    q = (
        db.query(AppUserSession.push_token)
        .join(AppUser, AppUser.id == AppUserSession.user_id)
        .filter(
            AppUser.is_active.is_(True),
            AppUser.notification_enabled.is_(True),
            AppUserSession.is_active.is_(True),
            AppUserSession.push_token.isnot(None),
            AppUserSession.push_token != "",
        )
    )

    q = _apply_filters(q, f)

    tokens = [t for (t,) in q.distinct(AppUserSession.push_token).all() if t]
    return tokens


@router.post("/admin/notifications/audience", response_model=AudienceCountOut)
def get_audience_count(
    data: Optional[AudienceFilter] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q_users = db.query(func.count(AppUser.id)).filter(
        AppUser.is_active.is_(True),
        AppUser.notification_enabled.is_(True),
    )
    q_users = _apply_filters(q_users, data)

    user_count = int(q_users.scalar() or 0)
    token_count = len(_get_audience_tokens(db, data))
    return AudienceCountOut(user_count=user_count, token_count=token_count)


@router.post("/admin/notifications/send", response_model=SendNotificationOut)
def send_notification(
    payload: SendNotificationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tokens = _get_audience_tokens(db, payload.filters)
    requested_tokens = len(tokens)

    if requested_tokens == 0:
        return SendNotificationOut(requested_tokens=0, sent=0, failures=0)

    messages: List[Dict[str, Any]] = []
    for t in tokens:
        messages.append(
            {
                "to": t,
                "title": payload.title,
                "body": payload.body or "",
                "data": payload.data or {},
            }
        )

    sent = 0
    failures = 0

    with httpx.Client(timeout=20.0) as client:
        for i in range(0, len(messages), 100):
            chunk = messages[i : i + 100]
            res = client.post(EXPO_PUSH_URL, json=chunk)
            if res.status_code >= 400:
                failures += len(chunk)
                continue
            try:
                data = res.json()
                receipts = data.get("data") if isinstance(data, dict) else None
                if isinstance(receipts, list):
                    for r in receipts:
                        if isinstance(r, dict) and r.get("status") == "ok":
                            sent += 1
                        else:
                            failures += 1
                else:
                    sent += len(chunk)
            except Exception:
                sent += len(chunk)

    return SendNotificationOut(requested_tokens=requested_tokens, sent=sent, failures=failures)


@router.get("/admin/notifications/rules", response_model=List[NotificationRule])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = _redis()
    return _read_rules(r)


@router.post("/admin/notifications/rules", response_model=NotificationRule)
def create_rule(
    data: NotificationRuleCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(UTC)
    rule = NotificationRule(
        id=uuid.uuid4().hex,
        name=data.name,
        enabled=bool(data.enabled),
        trigger=data.trigger,
        filters=data.filters,
        title=data.title,
        body=data.body,
        data=data.data,
        created_at=now,
        updated_at=now,
    )

    r = _redis()
    rules = _read_rules(r)
    rules.insert(0, rule)
    _write_rules(r, rules)
    return rule


@router.put("/admin/notifications/rules/{rule_id}", response_model=NotificationRule)
def update_rule(
    rule_id: str,
    data: NotificationRuleUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = _redis()
    rules = _read_rules(r)

    target = None
    for it in rules:
        if it.id == rule_id:
            target = it
            break

    if not target:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Regra não encontrada")

    if data.name is not None:
        target.name = data.name
    if data.enabled is not None:
        target.enabled = bool(data.enabled)
    if data.trigger is not None:
        target.trigger = data.trigger
    if data.filters is not None:
        target.filters = data.filters
    if data.title is not None:
        target.title = data.title
    if data.body is not None:
        target.body = data.body
    if data.data is not None:
        target.data = data.data

    target.updated_at = datetime.now(UTC)
    _write_rules(r, rules)
    return target


@router.delete("/admin/notifications/rules/{rule_id}")
def delete_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = _redis()
    rules = _read_rules(r)
    next_rules = [it for it in rules if it.id != rule_id]
    _write_rules(r, next_rules)
    return {"ok": True}
