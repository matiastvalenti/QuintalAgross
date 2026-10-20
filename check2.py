with open('C:/Users/matia/Cosas/Escritorio/Cosas/Programacion/Otro/QuintalAgross_Back/frontend/src/modules/purchases/PurchaseOrderForm.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

def check_balance(text, open_char, close_char):
    balance = 0
    for i, c in enumerate(text):
        if c == open_char: balance += 1
        elif c == close_char: balance -= 1
        if balance < 0:
            print(f"Unbalanced {close_char} at index {i}")
            return
    print(f"Final balance {open_char}{close_char}: {balance}")

check_balance(text, '{', '}')
check_balance(text, '(', ')')
check_balance(text, '[', ']')
