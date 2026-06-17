import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
import os

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.core.config import settings

# Database setup for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_api.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session")
def db_engine():
    Base.metadata.create_all(bind=engine)
    yield engine
    # Cleanup after all tests
    if os.path.exists("./test_api.db"):
        os.remove("./test_api.db")

@pytest.fixture(scope="function")
def db(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    del app.dependency_overrides[get_db]

@pytest.fixture(scope="function")
def auth_headers(client):
    # This assumes a test user exists or we create one
    # For now, let's mock it or use a default if seed exists
    # If the system requires login, we should create a test user here
    response = client.post("/auth/login", data={"username": "admin", "password": "admin"})
    if response.status_code == 200:
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    return {}
