# Génère icon-192.png et icon-512.png (fond vert + anneau de progression blanc).
# Python standard uniquement : python3 make_icons.py
import math, struct, zlib

def icon(size):
    rows = []
    c, r_out, r_in = size / 2, size * 0.32, size * 0.22
    for y in range(size):
        row = bytearray([0])  # filtre PNG "none"
        for x in range(size):
            hits = 0
            for sx, sy in ((.25, .25), (.75, .25), (.25, .75), (.75, .75)):  # anticrénelage 2x2
                dx, dy = x + sx - c, y + sy - c
                d = math.hypot(dx, dy)
                ang = (math.atan2(dx, -dy) + 2 * math.pi) % (2 * math.pi)  # 0 = midi, sens horaire
                if r_in <= d <= r_out and ang <= 1.5 * math.pi:  # arc de 270°
                    hits += 1
            a = hits / 4
            bg = (22, 163, 74)
            row += bytes(round(b + (255 - b) * a) for b in bg)
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))

for s in (192, 512):
    open(f'icon-{s}.png', 'wb').write(icon(s))
    print(f'icon-{s}.png')
