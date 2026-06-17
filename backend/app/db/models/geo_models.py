from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.db.session import Base

class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)  # e.g., 'AR', 'BR'
    name = Column(String, nullable=False)
    active = Column(Boolean, default=True)

    provinces = relationship("Province", back_populates="country")

class Province(Base):
    __tablename__ = "provinces"

    id = Column(Integer, primary_key=True, index=True)
    country_id = Column(Integer, ForeignKey("countries.id"), nullable=False)
    name = Column(String, nullable=False)
    georef_id = Column(String, index=True) # ID from external API
    active = Column(Boolean, default=True)

    country = relationship("Country", back_populates="provinces")
    localities = relationship("Locality", back_populates="province")

class Locality(Base):
    __tablename__ = "localities"

    id = Column(Integer, primary_key=True, index=True)
    province_id = Column(Integer, ForeignKey("provinces.id"), nullable=False)
    name = Column(String, nullable=False)
    georef_id = Column(String, index=True)
    active = Column(Boolean, default=True)

    province = relationship("Province", back_populates="localities")
    postal_codes = relationship("PostalCode", back_populates="locality")

class PostalCode(Base):
    __tablename__ = "postal_codes"

    id = Column(Integer, primary_key=True, index=True)
    locality_id = Column(Integer, ForeignKey("localities.id"), nullable=False)
    code = Column(String, nullable=False, index=True) # The actual Zip Code
    source = Column(String) # e.g., 'CPA', 'Georef', 'Manual'
    active = Column(Boolean, default=True)

    locality = relationship("Locality", back_populates="postal_codes")
