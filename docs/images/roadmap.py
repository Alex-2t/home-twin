"""Draws the README's roadmap timeline as two SVGs, for GitHub's light and dark themes.

Edit DONE, HERE and NEXT when a stage ships, then run: python3 docs/images/roadmap.py
It writes roadmap-light.svg and roadmap-dark.svg next to this file.
"""

import sys
from pathlib import Path

DONE = [
    ("Floor-plan editor", "draw, furnish, light"),
    ("Home Assistant panel", "the plan lives in HA"),
    ("Dashboard card", "the live 3D home"),
    ("AI build", "from a plan and a video"),
]
HERE = ("First release", "open to everyone")
NEXT = [
    ("More than one floor", "houses, basements, attics"),
    ("The outside", "facade, roof, garden"),
    ("Real sun and weather", "light follows the sky"),
    ("The day, replayed", "scrub back through history"),
    ("Climate on the plan", "heat map, energy"),
    ("People and motion", "presence, the vacuum's path"),
]

THEMES = {
    "light": {
        "text": "#1f2328",
        "muted": "#59636e",
        "faint": "#9198a1",
        "accent": "#2f6fde",
        "accent_soft": "rgba(47,111,222,0.14)",
        "future_line": "#d1d9e0",
        "future_fill": "#ffffff",
        "pill_text": "#ffffff",
    },
    "dark": {
        "text": "#e6edf3",
        "muted": "#9198a1",
        "faint": "#6e7681",
        "accent": "#5b9bff",
        "accent_soft": "rgba(91,155,255,0.20)",
        "future_line": "#3d444d",
        "future_fill": "#0d1117",
        "pill_text": "#0d1117",
    },
}

WIDTH = 1280
HEIGHT = 236
LINE_Y = 124
LEFT = 110
RIGHT = WIDTH - 110
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif"


def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def label(x: float, above: bool, title: str, note: str, title_color: str, note_color: str, weight: int) -> str:
    if above:
        title_y = LINE_Y - 52
        note_y = LINE_Y - 32
    else:
        title_y = LINE_Y + 46
        note_y = LINE_Y + 66
    return (
        f'<text x="{x:.1f}" y="{title_y}" text-anchor="middle" font-size="15" font-weight="{weight}" fill="{title_color}">{escape(title)}</text>'
        f'<text x="{x:.1f}" y="{note_y}" text-anchor="middle" font-size="13" fill="{note_color}">{escape(note)}</text>'
    )


def draw(theme_name: str) -> str:
    c = THEMES[theme_name]
    points = DONE + [HERE] + NEXT
    step = (RIGHT - LEFT) / (len(points) - 1)
    xs = [LEFT + i * step for i in range(len(points))]
    here_index = len(DONE)
    here_x = xs[here_index]

    parts = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" font-family="{FONT}">'
    )
    parts.append("<title>Home Twin roadmap</title>")

    # the road behind: solid accent; the road ahead: dashed and quiet
    parts.append(
        f'<line x1="{LEFT}" y1="{LINE_Y}" x2="{here_x:.1f}" y2="{LINE_Y}" stroke="{c["accent"]}" stroke-width="4" stroke-linecap="round"/>'
    )
    parts.append(
        f'<line x1="{here_x:.1f}" y1="{LINE_Y}" x2="{RIGHT}" y2="{LINE_Y}" stroke="{c["future_line"]}" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>'
    )

    for index, (title, note) in enumerate(points):
        x = xs[index]
        above = index % 2 == 0
        tick_from = LINE_Y - 22 if above else LINE_Y + 22
        if index < here_index:
            parts.append(
                f'<line x1="{x:.1f}" y1="{tick_from}" x2="{x:.1f}" y2="{LINE_Y}" stroke="{c["accent"]}" stroke-opacity="0.35" stroke-width="1.5"/>'
            )
            parts.append(f'<circle cx="{x:.1f}" cy="{LINE_Y}" r="12" fill="{c["accent"]}"/>')
            parts.append(
                f'<path d="M{x - 5:.1f} {LINE_Y + 0.5} l3.6 3.6 l6.6 -7.2" fill="none" stroke="{c["pill_text"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
            )
            parts.append(label(x, above, title, note, c["text"], c["muted"], 600))
        elif index == here_index:
            parts.append(f'<circle cx="{x:.1f}" cy="{LINE_Y}" r="26" fill="{c["accent_soft"]}"/>')
            parts.append(f'<circle cx="{x:.1f}" cy="{LINE_Y}" r="15" fill="{c["accent"]}"/>')
            parts.append(f'<circle cx="{x:.1f}" cy="{LINE_Y}" r="6" fill="{c["pill_text"]}"/>')
            pill_width = 112
            pill_y = LINE_Y - 98
            parts.append(
                f'<rect x="{x - pill_width / 2:.1f}" y="{pill_y}" width="{pill_width}" height="24" rx="12" fill="{c["accent"]}"/>'
            )
            parts.append(
                f'<text x="{x:.1f}" y="{pill_y + 16.5}" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="0.8" fill="{c["pill_text"]}">WE ARE HERE</text>'
            )
            parts.append(label(x, True, title, note, c["accent"], c["muted"], 700))
        else:
            parts.append(
                f'<line x1="{x:.1f}" y1="{tick_from}" x2="{x:.1f}" y2="{LINE_Y}" stroke="{c["future_line"]}" stroke-width="1.5"/>'
            )
            parts.append(
                f'<circle cx="{x:.1f}" cy="{LINE_Y}" r="9" fill="{c["future_fill"]}" stroke="{c["faint"]}" stroke-width="2"/>'
            )
            parts.append(label(x, above, title, note, c["muted"], c["faint"], 600))

    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    out.mkdir(parents=True, exist_ok=True)
    for theme_name in THEMES:
        (out / f"roadmap-{theme_name}.svg").write_text(draw(theme_name))


main()
