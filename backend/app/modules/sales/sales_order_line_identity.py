"""Validación de identificadores de líneas de OV."""


def validate_sales_order_line_ids(existing_ids, incoming_lines):
    existing = {str(value) for value in existing_ids}
    seen = set()

    for index, line in enumerate(incoming_lines, start=1):
        if isinstance(line, dict):
            raw_id = line.get("id")
        else:
            raw_id = getattr(line, "id", None)

        if raw_id is None or raw_id == "":
            continue

        line_id = str(raw_id)

        if line_id not in existing:
            raise ValueError(
                f"La línea {index} tiene un identificador "
                "que no pertenece a esta OV"
            )

        if line_id in seen:
            raise ValueError(
                f"El identificador de la línea {index} "
                "está repetido"
            )

        seen.add(line_id)

    return True
