import requests
import sys

API_URL = "http://localhost:8000"
# Puedes cambiar estos credenciales si falla el login
USER = "tomas_valenti" 
PASS = "admin"

class ApiTester:
    def __init__(self):
        self.base_url = API_URL
        self.pass_count = 0
        self.fail_count = 0
        self.fails = []
        self.token = self._get_token()
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def _get_token(self):
        try:
            r = requests.post(f"{API_URL}/auth/login", data={"username": USER, "password": PASS}, timeout=5)
            if r.status_code == 200:
                return r.json()["access_token"]
            print(f"FAILED LOGIN: {r.status_code} {r.text}. Verifica q el usuario/pass y URL ({API_URL}) sean validos.")
        except Exception as e:
            print(f"CONNECTION ERROR: No se detecta el servidor en {API_URL}. ¿Asumiendo que esta apagado? Error: {e}")
        sys.exit(1)

    def check(self, name, method, endpoint, expected_status=200, body=None, params=None):
        url = f"{API_URL}{endpoint}"
        try:
            kwargs = {"headers": self.headers, "timeout": 10}
            if params: kwargs["params"] = params
            if body and method.upper() in ["POST", "PUT", "PATCH"]: kwargs["json"] = body
            
            r = requests.request(method.upper(), url, **kwargs)
            
            is_pass = False
            if type(expected_status) == list:
                is_pass = r.status_code in expected_status
            else:
                is_pass = (r.status_code == expected_status)

            if is_pass:
                self.pass_count += 1
                print(f"  [OK]   {name} ({method.upper()} {endpoint}) -> {r.status_code}")
                try:
                    return r.json()
                except:
                    return r.text
            else:
                self.fail_count += 1
                self.fails.append(f"{name}: expected {expected_status} got {r.status_code}")
                print(f"  [FAIL] {name} ({method.upper()} {endpoint}) -> {r.status_code} | Respuesta: {r.text[:150]}")
                return None
        except Exception as e:
            self.fail_count += 1
            self.fails.append(f"{name}: exception {str(e)}")
            print(f"  [ERR]  {name} ({method.upper()} {endpoint}) -> {e}")
            return None

    def print_summary(self, module_name):
        print("\n" + "=" * 60)
        print(f"RESULTADOS PARA EL MODULO: {module_name.upper()}")
        print(f"PASARON: {self.pass_count} | FALLARON: {self.fail_count}")
        print("=" * 60)
        if self.fails:
            print("\nENDPOINTS QUE FALLARON:")
            for f in self.fails:
                print(f"  [X] {f}")
            print("\nPor favor revisa el backend console logs para mas detalles.")
        else:
            print("\n[OK] TODO FUNCIONA EXCELENTE!")
        
        if self.fail_count > 0:
            sys.exit(1)
