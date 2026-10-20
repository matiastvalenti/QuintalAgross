"""Startup checks in a disposable copy; never load the user's .env or database."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture
def isolated_backend(tmp_path):
    backend = tmp_path / 'backend'
    shutil.copytree(ROOT / 'backend/app', backend / 'app',
                    ignore=shutil.ignore_patterns('__pycache__', '*.db', '.env'))
    (backend / '.env').write_text('SECRET_KEY=temporary-test-key\nPROJECT_NAME=Isolated test\n')
    return backend


def run_python(backend, cwd, source):
    env = os.environ.copy()
    for key in ('DATABASE_URL', 'SECRET_KEY', 'PROJECT_NAME'):
        env.pop(key, None)
    env['PYTHONPATH'] = str(backend)
    result = subprocess.run([sys.executable, '-c', source], cwd=cwd, env=env,
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr


def test_settings_load_backend_env_from_another_directory(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, '''
from app.core.config import settings
assert settings.PROJECT_NAME == 'Isolated test'
assert settings.SECRET_KEY == 'temporary-test-key'
''')


def test_health_and_static_mounts_without_startup_side_effects(isolated_backend, tmp_path):
    # TestClient without a context manager does not run the migration/scheduler lifespan.
    run_python(isolated_backend, tmp_path, '''
from fastapi.testclient import TestClient
from app.main import app, BACKEND_ROOT
with (BACKEND_ROOT / 'uploads' / 'probe.txt').open('w') as f:
    f.write('isolated upload')
client = TestClient(app)
assert client.get('/health').json() == {'ok': True}
assert client.get('/uploads/probe.txt').text == 'isolated upload'
assert not (BACKEND_ROOT / 'sql_app_v2.db').exists()
''')


def test_fractional_stock_and_nonblocking_warnings(isolated_backend, tmp_path):
    run_python(isolated_backend, tmp_path, """
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db.base import Base
from app.db.models.commercial_models import Product, Warehouse, StockItem, StockMovement
from app.modules.inventory.stock_schemas import StockMovementHeaderCreate, StockAdjustmentCreate
from app.modules.inventory.stock_router import create_stock_movement, adjust_stock
from app.modules.inventory.warehouse_schemas import WarehouseCreate
assert WarehouseCreate(name='Origen').no_stock_control.value == 'WARNING'
engine = create_engine('sqlite:///:memory:')
Base.metadata.create_all(engine)
with Session(engine) as db:
    db.add_all([Product(id='p', name='Producto de prueba', quantity_per_container=20),
                Warehouse(id='a', name='Origen'), Warehouse(id='b', name='Destino')])
    db.flush()
    db.add(StockItem(product_id='p', warehouse_id='a', qty_on_hand=Decimal('0.30')))
    db.commit()
    data = StockMovementHeaderCreate(movement_type='TRANSFER', from_warehouse_id='a',
        to_warehouse_id='b', lines=[{'product_id':'p', 'qty':'0.20', 'container_qty':'0.01'},
                                 {'product_id':'p', 'qty':'0.20', 'container_qty':'0.01'}])
    result = create_stock_movement(data, db)
    assert len(result['warnings']) == 1
    assert result['warnings'][0]['resulting_qty'] == -0.1
    balances = {s.warehouse_id:s.qty_on_hand for s in db.query(StockItem).all()}
    assert balances == {'a':Decimal('-0.10'), 'b':Decimal('0.40')}
    assert db.query(StockMovement).filter_by(stock_negative=True).count() == 1
    result = adjust_stock(StockAdjustmentCreate(product_id='p', warehouse_id='a', qty='0.10'), db)
    assert result['warnings'] == []
    result = adjust_stock(StockAdjustmentCreate(product_id='p', warehouse_id='a', qty='-0.05'), db)
    assert result['warnings'][0]['resulting_qty'] == -0.05
assert not __import__('pathlib').Path('backend/sql_app_v2.db').exists()
""")
