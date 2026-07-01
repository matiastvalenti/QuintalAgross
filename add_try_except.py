import sys
lines = open('backend/app/modules/accounting/applications_router.py', 'r', encoding='utf-8').readlines()
start = None
end = None
for i, line in enumerate(lines):
    if 'for item in payload.items:' in line:
        start = i
    if 'return {' in line and start is not None and i > start:
        pass
    if 'warnings' in line and ']' in line and start is not None and end is None:
        end = i + 2 # include closing brace

if start is not None and end is not None:
    new_lines = lines[:start]
    new_lines.append('    import logging\n')
    new_lines.append('    logger = logging.getLogger(__name__)\n')
    new_lines.append('    try:\n')
    for i in range(start, end):
        new_lines.append('    ' + lines[i])
    new_lines.append('    except HTTPException:\n')
    new_lines.append('        db.rollback()\n')
    new_lines.append('        raise\n')
    new_lines.append('    except Exception as e:\n')
    new_lines.append('        db.rollback()\n')
    new_lines.append('        logger.exception("Error creating sales application")\n')
    new_lines.append('        raise HTTPException(\n')
    new_lines.append('            status_code=500,\n')
    new_lines.append('            detail=f"Error al crear aplicación de venta: {str(e)}"\n')
    new_lines.append('        )\n')
    new_lines.extend(lines[end:])
    open('backend/app/modules/accounting/applications_router.py', 'w', encoding='utf-8').writelines(new_lines)
    print('Done')
else:
    print('Not found', start, end)
