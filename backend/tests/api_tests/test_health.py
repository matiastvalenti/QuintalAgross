import pytest

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}

def test_auth_me_unauthorized(client):
    response = client.get("/auth/me")
    assert response.status_code == 401
