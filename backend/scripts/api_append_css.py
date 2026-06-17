import os

file_path = r"c:\Users\matia\Cosas\Escritorio\Programacion\Otro\QuintalAgross_Back\web\src\pages\ChequesPage.module.css"

with open(file_path, "r") as f:
    content = f.read()

# Find the last closing brace for the media query and then everything after it
# Or just ensure it's not being repeated.
if ".batchBar" not in content:
    # Append it
    content += """

/* BATCH ACTIONS BAR */
.batchBar {
    background: var(--primary);
    color: white;
    padding: 12px 32px;
    border-radius: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    gap: 12px;
    box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.3);
    animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.selectedRow {
    background: var(--primary-light) !important;
}

.checkBanner {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
}

.batchActions {
    display: flex;
    gap: 8px;
}

.batchActions button {
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    padding: 6px 14px !important;
    font-size: 13px !important;
    font-weight: 600;
}

.batchActions button:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    border-color: white !important;
}

@keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}
"""
    with open(file_path, "w") as f:
        f.write(content)
    print("SUCCESS")
else:
    print("ALREADY EXISTS")
