import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.modules.purchases import router
    print("Purchases router imported OK")
    from app.modules.purchases import price_comparison_router
    print("Price comparison router imported OK")
except Exception as e:
    import traceback
    traceback.print_exc()
