"""Generate new counter-threat puzzles without modifying the original bank.

Uses a deterministic BFS from the normal starting position for legal provenance,
then exhaustively records all forcing first moves and all replies/winning finishes.
Requires Python 3 and a C++17 compiler. No external corpus or Python dependencies.
Example: python scripts/generate-counter-threat.py --output additional-puzzles.json
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from generate import moves, apply, wins


def move(m):
    return {'from': m[0], 'to': m[1]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--existing', type=Path, default=ROOT / 'dist/puzzles.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'additional-puzzles.json')
    parser.add_argument('--per-kind', type=int, default=100)
    args = parser.parse_args()
    existing = json.loads(args.existing.read_text())
    # Existing counter-threat entries may be regenerated, while classic IDs stay fixed.
    old = [p for p in existing if p.get('pattern') != 'counter-threat']
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        exclusions = directory / 'existing.txt'
        exclusions.write_text('\n'.join(f"{sum(1 << n for n in p['own'])} {sum(1 << n for n in p['other'])}" for p in old))
        binary = directory / 'generator'
        subprocess.run(['c++', '-O3', '-std=c++17', str(ROOT / 'scripts/generate-counter-threat.cpp'), '-o', str(binary)], check=True)
        result = subprocess.run([str(binary), str(exclusions), str(args.per_kind)], check=True, capture_output=True, text=True)
        print(result.stderr, end='', file=sys.stderr)
    bank = []
    for line in result.stdout.splitlines():
        a, b, count, length, *steps = map(int, line.split())
        own, other = tuple(i for i in range(25) if a & (1 << i)), tuple(i for i in range(25) if b & (1 << i))
        solutions = []
        for first in moves(own, other):
            aa = apply(own, first)
            if wins(other, aa):
                continue
            replies = []
            for response in moves(other, aa):
                finishes = wins(aa, apply(other, response))
                if not finishes:
                    break
                replies.append({**move(response), 'wins': list(map(move, finishes))})
            else:
                if replies:
                    solutions.append({**move(first), 'replies': replies})
        assert len(solutions) == count
        first = solutions[0]
        bank.append({'id': max(p['id'] for p in old) + len(bank) + 1,
                     'own': own, 'other': other, 'pattern': 'counter-threat',
                     'solution': {'from': first['from'], 'to': first['to']},
                     'replies': first['replies'], 'solutions': solutions,
                     'path': [steps[i:i+2] for i in range(0, len(steps), 2)], 'turn': length % 2})
    args.output.write_text(json.dumps(bank, separators=(',', ':')) + '\n')
    print(f'Wrote {len(bank)} puzzles to {args.output}')


if __name__ == '__main__':
    main()
