import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, current_user, login_required, login_user, logout_user
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

logger = logging.getLogger(__name__)

basedir = os.path.abspath(os.path.dirname(__file__))
instance_path = os.path.join(basedir, "instance")
os.makedirs(instance_path, exist_ok=True)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-for-production")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(instance_path, "certifyme.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_PERMANENT"] = False

db = SQLAlchemy(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.remember_cookie_duration = timedelta(days=30)
login_manager.session_protection = "strong"


def ok(**data_fields):
    """Standard success: {\"status\": \"success\", \"data\": {...}}."""
    return jsonify({"status": "success", "data": data_fields}), 200


def created(**data_fields):
    return jsonify({"status": "success", "data": data_fields}), 201


def err(message: str, code: int = 400):
    return jsonify({"status": "error", "message": message, "data": None}), code


CORS(
    app,
    supports_credentials=True,
    resources={
        r"/api/*": {
            "origins": [
                "http://127.0.0.1:5500",
                "http://localhost:5500",
                "http://127.0.0.1:8080",
                "http://localhost:8080",
                "http://127.0.0.1:5000",
                "http://localhost:5000",
            ],
            "allow_headers": ["Content-Type"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        }
    },
)


class Admin(UserMixin, db.Model):
    __tablename__ = "admins"
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    opportunities = db.relationship("Opportunity", backref="admin", lazy=True, cascade="all, delete-orphan")


@login_manager.user_loader
def load_user(user_id):
    if user_id is None:
        return None
    return db.session.get(Admin, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    return err("Unauthorized", 401)


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"
    id = db.Column(db.Integer, primary_key=True)
    token_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=False)
    admin = db.relationship("Admin", backref="reset_tokens")
    expires_at = db.Column(db.DateTime, nullable=False)


class Opportunity(db.Model):
    __tablename__ = "opportunities"
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=False, index=True)
    name = db.Column(db.String(500), nullable=False)
    duration = db.Column(db.String(200), nullable=False)
    start_date = db.Column(db.String(32), nullable=False)
    description = db.Column(db.Text, nullable=False)
    skills = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    future_opportunities = db.Column(db.Text, nullable=False)
    max_applicants = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


ALLOWED_CATEGORIES = frozenset({"technology", "business", "design", "marketing", "data", "other"})
RESET_LINK_BASE = os.environ.get(
    "RESET_LINK_BASE",
    "http://127.0.0.1:8080/reset-password.html",
)


def hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def validate_email(email: str) -> bool:
    if not email or "@" not in email:
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    local, domain = parts
    return bool(local) and "." in domain


@app.route("/api/health")
def health():
    return ok(ok=True)


@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm = data.get("confirm_password") or ""

    if not name:
        return err("Full name is required.", 400)
    if not validate_email(email):
        return err("Enter a valid email address.", 400)
    if len(password) < 8:
        return err("Password must be at least 8 characters.", 400)
    if password != confirm:
        return err("Passwords do not match.", 400)

    if Admin.query.filter_by(email=email).first():
        return err("An account with this email already exists.", 409)

    admin = Admin(full_name=name, email=email, password_hash=generate_password_hash(password))
    db.session.add(admin)
    db.session.commit()
    return created(message="Account created successfully.")


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    remember_me = bool(data.get("remember_me"))

    admin = Admin.query.filter_by(email=email).first()
    if not admin or not check_password_hash(admin.password_hash, password):
        return err("Invalid email or password", 401)

    login_user(admin, remember=remember_me)

    return ok(
        message="Logged in.",
        user={"id": admin.id, "full_name": admin.full_name, "email": admin.email},
    )


@app.route("/api/logout", methods=["POST"])
def logout():
    if current_user.is_authenticated:
        logout_user()
    return ok(message="Logged out.")


@app.route("/api/me", methods=["GET"])
def me():
    if not current_user.is_authenticated:
        return ok(authenticated=False)
    return ok(
        authenticated=True,
        user={
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
        },
    )


FORGOT_MESSAGE = "If email exists, reset link sent"


@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    admin = Admin.query.filter_by(email=email).first()
    if admin:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_reset_token(raw_token)
        expires_at = datetime.utcnow() + timedelta(hours=1)

        PasswordResetToken.query.filter_by(admin_id=admin.id).delete()

        db.session.add(
            PasswordResetToken(token_hash=token_hash, admin_id=admin.id, expires_at=expires_at)
        )
        db.session.commit()

        reset_url = f"{RESET_LINK_BASE}?token={raw_token}"
        logger.warning("Password reset link generated for %s — %s", email, reset_url)
        print(f"[reset-link] email={email} url={reset_url} expires_at={expires_at.isoformat()}Z")

    return ok(message=FORGOT_MESSAGE)


@app.route("/api/reset-status", methods=["GET"])
def reset_status():
    raw = (request.args.get("token") or "").strip()
    if not raw:
        return err("missing_token", 400)

    token_hash = hash_reset_token(raw)
    row = PasswordResetToken.query.filter_by(token_hash=token_hash).first()
    if not row:
        return ok(valid=False, error="invalid_token")
    if row.expires_at < datetime.utcnow():
        return ok(valid=False, error="expired")
    return ok(valid=True)


@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}
    raw_token = (data.get("token") or "").strip()
    password = data.get("password") or ""

    if len(password) < 8:
        return err("Password must be at least 8 characters.", 400)

    token_hash = hash_reset_token(raw_token)
    row = PasswordResetToken.query.filter_by(token_hash=token_hash).first()
    if not row:
        return err("This reset link is invalid or has already been used.", 400)
    if row.expires_at < datetime.utcnow():
        return err("This reset link has expired. Please request a new one.", 400)

    admin = db.session.get(Admin, row.admin_id)
    if not admin:
        return err("Account not found.", 400)

    admin.password_hash = generate_password_hash(password)
    db.session.delete(row)
    db.session.commit()
    return ok(message="Your password has been updated. You can sign in now.")


def opportunity_to_dict(o: Opportunity):
    return {
        "id": o.id,
        "name": o.name,
        "duration": o.duration,
        "start_date": o.start_date,
        "description": o.description,
        "skills": o.skills,
        "category": o.category,
        "future_opportunities": o.future_opportunities,
        "max_applicants": o.max_applicants,
    }


@app.route("/api/opportunities", methods=["GET"])
@login_required
def list_opportunities():
    rows = (
        Opportunity.query.filter_by(admin_id=current_user.id)
        .order_by(Opportunity.created_at.desc())
        .all()
    )
    return ok(opportunities=[opportunity_to_dict(o) for o in rows])


@app.route("/api/opportunities", methods=["POST"])
@login_required
def create_opportunity():
    data = request.get_json(silent=True) or {}
    verr = _validate_opportunity_payload(data)
    if verr:
        return err(verr, 400)

    max_app = data.get("max_applicants")
    max_app = int(max_app) if max_app not in (None, "", []) else None

    o = Opportunity(
        admin_id=current_user.id,
        name=data["name"].strip(),
        duration=data["duration"].strip(),
        start_date=data["start_date"].strip(),
        description=data["description"].strip(),
        skills=data["skills"].strip(),
        category=data["category"].strip(),
        future_opportunities=data["future_opportunities"].strip(),
        max_applicants=max_app,
    )
    db.session.add(o)
    db.session.commit()
    return created(opportunity=opportunity_to_dict(o))


def _validate_opportunity_payload(data):
    name = (data.get("name") or "").strip()
    duration = (data.get("duration") or "").strip()
    start_date = (data.get("start_date") or "").strip()
    description = (data.get("description") or "").strip()
    skills = (data.get("skills") or "").strip()
    category = (data.get("category") or "").strip()
    future = (data.get("future_opportunities") or "").strip()
    max_app = data.get("max_applicants")

    if not name:
        return "Opportunity name is required."
    if not duration:
        return "Duration is required."
    if not start_date:
        return "Start date is required."
    if not description:
        return "Description is required."
    if not skills:
        return "Skills to gain are required."
    if not category:
        return "Category is required."
    if category not in ALLOWED_CATEGORIES:
        return "Invalid category."
    if not future:
        return "Future opportunities is required."

    if max_app not in (None, "", []):
        try:
            n = int(max_app)
            if n < 1:
                return "Maximum applicants must be a positive number."
        except (TypeError, ValueError):
            return "Maximum applicants must be a valid number."

    return None


@app.route("/api/opportunities/<int:opp_id>", methods=["PUT"])
@login_required
def update_opportunity(opp_id):
    o = db.session.get(Opportunity, opp_id)
    if not o or o.admin_id != current_user.id:
        return err("Opportunity not found.", 404)

    data = request.get_json(silent=True) or {}
    verr = _validate_opportunity_payload(data)
    if verr:
        return err(verr, 400)

    max_app = data.get("max_applicants")
    max_app = int(max_app) if max_app not in (None, "", []) else None

    o.name = data["name"].strip()
    o.duration = data["duration"].strip()
    o.start_date = data["start_date"].strip()
    o.description = data["description"].strip()
    o.skills = data["skills"].strip()
    o.category = data["category"].strip()
    o.future_opportunities = data["future_opportunities"].strip()
    o.max_applicants = max_app
    o.updated_at = datetime.utcnow()
    db.session.commit()
    return ok(opportunity=opportunity_to_dict(o))


@app.route("/api/opportunities/<int:opp_id>", methods=["DELETE"])
@login_required
def delete_opportunity(opp_id):
    o = db.session.get(Opportunity, opp_id)
    if not o or o.admin_id != current_user.id:
        return err("Opportunity not found.", 404)
    db.session.delete(o)
    db.session.commit()
    return ok(message="Deleted.")


@app.route("/")
def root():
    return jsonify(
        {
            "status": "success",
            "data": {"message": "CertifyMe API — use /api/* endpoints."},
        }
    )


@app.errorhandler(500)
def server_error(_e):
    return err("Server error. Please try again later.", 500)


with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
