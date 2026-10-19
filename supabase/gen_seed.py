"""Genera supabase/seed.sql a partir del Excel exportado de Google Sheets.
Uso: python3 -I gen_seed.py <ruta.xlsx> <salida.sql>
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
T = '{%s}t' % NS['m']

COLS = {
    'A': 'id', 'B': 'created_at', 'C': 'attended_at', 'D': 'updated_at', 'E': 'brigadista_texto',
    'F': 'estado', 'G': 'prioridad', 'H': 'contacto_nombre', 'I': 'contacto_telefono',
    'J': 'lat', 'K': 'lng', 'L': 'plus_code', 'M': 'danio_vivienda', 'N': 'foto_url',
    'P': 'adultos', 'Q': 'adultos_mayores', 'R': 'menores', 'S': 'discapacitados',
    'T': 'casos_medicos', 'U': 'condiciones_medicas', 'V': 'perros', 'W': 'gatos',
    'X': 'nec_agua', 'Y': 'nec_kit_alimento', 'Z': 'nec_kit_higiene', 'AA': 'nec_lona',
    'AB': 'nec_camping', 'AC': 'nec_toldas', 'AD': 'nec_colchonetas', 'AE': 'nec_otros',
    'AF': 'ent_agua', 'AG': 'ent_kit_alimento', 'AH': 'ent_kit_higiene', 'AI': 'ent_lona',
    'AJ': 'ent_camping', 'AK': 'ent_toldas', 'AL': 'ent_colchonetas', 'AM': 'ent_otros',
    'AN': 'observaciones_atencion',
}
# Columna O (Total Personas) se omite: en Supabase es una columna generada.
TEXT = {'id', 'brigadista_texto', 'estado', 'prioridad', 'contacto_nombre', 'plus_code',
        'danio_vivienda', 'foto_url', 'observaciones_atencion'}
TS = {'created_at', 'attended_at', 'updated_at'}
INTS = {'adultos', 'adultos_mayores', 'menores', 'discapacitados', 'casos_medicos', 'perros', 'gatos'}
FLOATS = {'lat', 'lng'}
BOOLS = {c for c in COLS.values() if c.startswith(('nec_', 'ent_')) and not c.endswith('_otros')}
ARRAYS = {'condiciones_medicas', 'nec_otros', 'ent_otros'}


def q(s):
    return "'" + s.replace("'", "''") + "'"


def read_rows(path):
    z = zipfile.ZipFile(path)
    ss = [''.join(t.text or '' for t in si.iter(T))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = []
    for row in sheet.findall('.//m:row', NS):
        d = {}
        for c in row.findall('m:c', NS):
            v = c.find('m:v', NS)
            if v is None:
                continue
            col = re.match(r'[A-Z]+', c.get('r')).group()
            d[col] = ss[int(v.text)] if c.get('t') == 's' else v.text
        rows.append(d)
    return rows[0], [r for r in rows[1:] if r]


def phone(v):
    v = v.strip()
    if re.fullmatch(r'[\d.]+E\d+|\d+(\.0)?', v):
        digits = str(int(Decimal(v)))
        if len(digits) == 8:
            return digits[:4] + '-' + digits[4:]
        return digits
    return v


def sql_value(col, raw):
    raw = (raw or '').strip()
    if col in ARRAYS:
        items = [s.strip() for s in raw.split(',') if s.strip()]
        return "'{}'::text[]" if not items else 'array[' + ', '.join(q(i) for i in items) + ']::text[]'
    if col in BOOLS:
        if raw not in ('Sí', 'No', ''):
            raise ValueError(f'{col}: valor booleano inesperado {raw!r}')
        return 'true' if raw == 'Sí' else 'false'
    if col in INTS:
        return str(int(Decimal(raw or '0')))
    if raw == '':
        return 'null'
    if col in FLOATS:
        return str(Decimal(raw))
    if col in TS:
        return q(raw) + '::timestamptz'
    if col == 'contacto_telefono':
        return q(phone(raw))
    return q(raw)


def club_info(name):
    tipo = 'rotaract' if 'rotaract' in name.lower() else 'rotary'
    low = name.lower()
    prov = 'Herrera' if 'chitr' in low else ('Coclé' if 'aguadulce' in low else None)
    return tipo, prov


def main(src, dst):
    header, data = read_rows(src)
    assert header.get('A') == 'ID' and header.get('AN') == 'Observaciones Atencion', 'Encabezados inesperados'
    clubs = sorted({d['E'].strip() for d in data if d.get('E', '').strip().lower().startswith('club ')})
    cols = list(COLS.values())
    out = [
        '-- Seed de Brigada Rotary: datos reales exportados de Google Sheets.',
        '-- CONTIENE DATOS PERSONALES. No subir a git (está en .gitignore).',
        f'-- {len(data)} reportes, {len(clubs)} clubes.',
        '',
        'begin;',
        '',
        'insert into public.clubs (nombre, tipo, provincia) values',
    ]
    out.append(',\n'.join(
        f"  ({q(c)}, {q(club_info(c)[0])}, {q(club_info(c)[1]) if club_info(c)[1] else 'null'})" for c in clubs
    ) + '\non conflict (nombre) do nothing;')
    out += ['', f'insert into public.reportes (club_id, {", ".join(cols)}) values']
    values = []
    for d in data:
        brig = d.get('E', '').strip()
        club = f'(select id from public.clubs where nombre = {q(brig)})' if brig in clubs else 'null'
        vals = [club] + [sql_value(col, d.get(letter)) for letter, col in COLS.items()]
        values.append('  (' + ', '.join(vals) + ')')
    out.append(',\n'.join(values) + '\non conflict (id) do nothing;')
    out += ['', 'commit;', '']
    with open(dst, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

    total = sum(int(Decimal(d.get(k) or '0')) for d in data for k in ('P', 'Q', 'R'))
    excel_total = sum(int(Decimal(d.get('O') or '0')) for d in data)
    print(f'reportes={len(data)} clubes={clubs} total_personas={total} (excel={excel_total})')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
