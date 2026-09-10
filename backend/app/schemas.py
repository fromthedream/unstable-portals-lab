from pydantic import BaseModel, Field


class PortalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    destination_world: str = Field(min_length=1, max_length=100)

class PortalAction(BaseModel):
    action: str
    confirm: bool = False
    amount: int = 1