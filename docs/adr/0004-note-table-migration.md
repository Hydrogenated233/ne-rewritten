# Preserve Literal Text When Migrating Notes to Tables

The user chose a cell-based note editor instead of CSV-like text editing.
Existing notes migrate one original text line per row in the first column,
preserving commas and quotes literally rather than interpreting them as column
delimiters. This deliberately differs from the previous XLSX export parser:
preserving mathematical expressions takes priority over reproducing inferred
columns in historical exports.
