"""Editable operational proposal, pending accountant review; never loaded at startup."""
from app.db.models.commercial_models import Account
from app.db.models.models import LedgerSetting

BASE_ACCOUNTS = [
    ('1.1.1.001', 'Caja'), ('1.1.1.002', 'Bancos'), ('1.1.1.003', 'Cheques en cartera'),
    ('1.1.2.001', 'Clientes'), ('1.1.3.001', 'IVA crédito fiscal'),
    ('1.1.3.004', 'Retenciones sufridas'), ('2.1.1.001', 'Proveedores'),
    ('2.1.2.001', 'IVA débito fiscal'), ('2.1.2.004', 'Retenciones a depositar'),
    ('4.1.1.001', 'Ventas de insumos'), ('5.1.1.001', 'Costo de insumos vendidos'),
    ('4.1.2.001', 'Ventas de granos'), ('5.1.2.001', 'Costo de granos comercializados'),
    ('4.1.3.001', 'Servicios de dron y aplicaciones'), ('4.1.4.001', 'Servicios de fletes'),
    ('4.1.9.001', 'Otros servicios'),
]
ACTIVITIES = {'DRONE': ('3', 'Dron y aplicaciones'), 'FREIGHT': ('4', 'Fletes'),
              'OTHER_SERVICES': ('9', 'Otros servicios')}
CATEGORIES = {'LABOR': ('001', 'Personal'), 'FUEL': ('002', 'Combustible'),
              'REPAIR': ('003', 'Reparaciones'), 'OTHER': ('099', 'Otros costos')}
PLAN = BASE_ACCOUNTS + [(f'5.1.{prefix}.{suffix}', f'{label} - {activity}')
    for prefix, activity in ACTIVITIES.values() for suffix, label in CATEGORIES.values()]


def income_code(db, activity):
    setting = db.get(LedgerSetting, f'SERVICE_{activity}_SALES')
    return setting.value if setting else f'4.1.{ACTIVITIES[activity][0]}.001'


def add_missing_accounts(db):
    created = []
    for code, name in PLAN:
        if not db.query(Account).filter_by(code=code).first():
            db.add(Account(code=code, name=name, active=True))
            created.append(code)
    for activity in ACTIVITIES:
        key = f'SERVICE_{activity}_SALES'
        if not db.get(LedgerSetting, key):
            db.add(LedgerSetting(key=key, value=income_code(db, activity), description='Ingresos de '+ACTIVITIES[activity][1]))
    db.flush()
    return created
