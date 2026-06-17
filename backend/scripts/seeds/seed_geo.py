import requests
import sys
import os

# Ensure we can import from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
print(f"DEBUG: sys.path appended {os.path.dirname(os.path.abspath(__file__))}")

from app.db.session import SessionLocal, engine, Base
from app.db.geo_models import Country, Province, Locality, PostalCode

db = SessionLocal()

GEOREF_API = "https://apis.datos.gob.ar/georef/api"

def log(msg):
    print(msg, flush=True)
    with open("seed.log", "a", encoding="utf-8") as f:
        f.write(msg + "\n")

def seed_countries():
    log("Checking Countries...")
    ar = db.query(Country).filter(Country.code == 'AR').first()
    if not ar:
        log("Creating Argentina...")
        ar = Country(code='AR', name='Argentina', active=True)
        db.add(ar)
        db.commit()
    else:
        log("Argentina exists.")
    
    # Mercosur
    others = [
        ('BR', 'Brasil'), ('UY', 'Uruguay'), ('PY', 'Paraguay'), 
        ('CL', 'Chile'), ('BO', 'Bolivia')
    ]
    for code, name in others:
        c = db.query(Country).filter(Country.code == code).first()
        if not c:
            log(f"Creating {name}...")
            db.add(Country(code=code, name=name, active=True))
    db.commit()

def seed_provinces():
    ar = db.query(Country).filter(Country.code == 'AR').first()
    if not ar: return

    log("Fetching Provinces from Georef...")
    resp = requests.get(f"{GEOREF_API}/provincias?max=100")
    data = resp.json()
    
    for p_data in data['provincias']:
        pid = p_data['id']
        name = p_data['nombre']
        
        prov = db.query(Province).filter(Province.georef_id == pid).first()
        if not prov:
            log(f"  + {name}")
            prov = Province(
                country_id=ar.id,
                name=name,
                georef_id=pid,
                active=True
            )
            db.add(prov)
    db.commit()

def seed_localities_and_cp():
    log("Fetching Localities (this may take a while)...")
    provinces = db.query(Province).filter(Province.country_id == 1).all() # AR
    
    for prov in provinces:
        log(f"Processing {prov.name}...")
        # Fetch localities for this province
        # Georef 'localidades-censales' or 'localidades'? 'localidades' is better for postal purposes usually
        url = f"{GEOREF_API}/localidades?provincia={prov.georef_id}&max=5000&campos=id,nombre,municipio"
        resp = requests.get(url)
        data = resp.json()
        
        count = 0
        for l_data in data['localidades']:
            lid = l_data['id']
            name = l_data['nombre']
            
            loc = db.query(Locality).filter(Locality.georef_id == lid).first()
            if not loc:
                loc = Locality(
                    province_id=prov.id,
                    name=name,
                    georef_id=lid,
                    active=True
                )
                db.add(loc)
                db.commit() # Commit to get ID
                pass
            count += 1
        log(f"  -> {count} localities processed.")

if __name__ == "__main__":
    log("--- Starting Geo Seed ---")
    Base.metadata.create_all(bind=engine) # Ensure tables
    seed_countries()
    seed_provinces()
    seed_localities_and_cp()
    log("--- Finished ---")
