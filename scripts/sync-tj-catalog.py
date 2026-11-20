"""Append verified TJ releases as immutable batches consumed by the phone remotes."""
import argparse
import csv
import hashlib
import html
import http.cookiejar
import io
import json
import re
import time
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://www.tjmedia.com'
KST = timezone(timedelta(hours=9))
ANCHOR = date(2026, 11, 21)
MANIFEST = 'catalog-updates.json'


class PageMetadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}

    def handle_starttag(self, tag, attrs):
        item = dict(attrs)
        if tag == 'meta' and item.get('name') in {'_csrf', '_csrf_header'}:
            self.values[item['name']] = item.get('content')


def fetch_months(months):
    client = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    client.addheaders = [('User-Agent', 'Mozilla/5.0 (Neutinamu karaoke catalog sync)'), ('Referer', SITE + '/song/recent_song')]
    with client.open(SITE + '/song/recent_song', timeout=30) as response:
        page = PageMetadata()
        page.feed(response.read().decode())
    headers = {'Accept': 'application/json', 'Origin': SITE, 'X-Requested-With': 'XMLHttpRequest'}
    if page.values.get('_csrf_header') and page.values.get('_csrf'):
        headers[page.values['_csrf_header']] = page.values['_csrf']
    for month in months:
        query = urlencode({'searchYm': month})
        for attempt in range(3):
            try:
                url = SITE + '/legacy/api/newSongOfMonth'
                request = Request(url, data=query.encode(), headers=headers)
                if attempt == 1:
                    request = Request(url + '?' + query, headers=headers)
                with client.open(request, timeout=30) as response:
                    body = json.load(response)
                rows = body['resultData']['items']
                if str(body['resultCode']) != '99' or not isinstance(rows, list) or len(rows) != int(body['resultData']['itemsTotalCount']):
                    raise ValueError('Incomplete monthly response')
                break
            except (OSError, KeyError, TypeError, ValueError):
                if attempt == 2:
                    raise
                time.sleep(2)
        yield month, rows


def months_between(start, end):
    current = start.replace(day=1)
    while current <= end:
        yield current.strftime('%Y%m')
        current = (current + timedelta(days=32)).replace(day=1)


def known_codes(root, manifest):
    codes = set()
    files = ['catalog-20261018.csv', 'catalog-update-20261104.csv']
    for batch in manifest['batches']:
        name = batch['file']
        if not re.fullmatch(r'catalog-update-\d{8}(-[a-f0-9]{12})?\.csv', name):
            raise ValueError('Invalid batch filename')
        raw = (root / name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != batch['sha256']:
            raise ValueError('Existing batch checksum mismatch')
        files.append(name)
    for name in files:
        with (root / name).open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.reader(stream)
            next(reader)
            codes.update(row[0].strip() for row in reader if row)
    return codes


def collect(root, today, if_due=False, fetch=fetch_months):
    path = root / MANIFEST
    manifest = json.loads(path.read_text())
    last = date.fromisoformat(manifest['through'])
    target = today - timedelta(days=(today - ANCHOR).days % 14)
    if last > today:
        raise ValueError('The saved check date is in the future')
    if if_due and last >= target:
        print(f'Already checked this cycle through {last}')
        return
    codes = known_codes(root, manifest)
    additions = {}
    for month, rows in fetch(months_between(last - timedelta(days=31), today)):
        if month < today.strftime('%Y%m') and not any(r['publishdate'][:7].replace('-', '') == month for r in rows):
            raise ValueError(f'Empty completed month {month}')
        for row in rows:
            code = str(row['pro']).strip()
            published = date.fromisoformat(row['publishdate'][:10])
            title = html.unescape(row['indexTitle']).strip()
            artist = html.unescape(row['indexSong'] or '').strip()
            if not re.fullmatch('[1-9][0-9]{0,7}', code) or not title:
                raise ValueError(f'Unexpected official metadata in {month}')
            # TJ can include releases from later months in a monthly response.
            if published.strftime('%Y%m') != month or published > today or code in codes:
                continue
            if code in additions and additions[code] != (title, artist):
                raise ValueError(f'Conflicting official records for {code}')
            additions[code] = (title, artist)
    if additions:
        stream = io.StringIO(newline='')
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(['곡번호', '곡제목', '가수'])
        for code in sorted(additions, key=int):
            writer.writerow([code, *additions[code]])
        raw = stream.getvalue().encode('utf-8-sig')
        digest = hashlib.sha256(raw).hexdigest()
        name = f'catalog-update-{today:%Y%m%d}-{digest[:12]}.csv'
        dest = root / name
        if dest.exists() and dest.read_bytes() != raw:
            raise ValueError('Immutable batch collision')
        dest.write_bytes(raw)
        manifest['batches'].append({'file': name, 'sha256': digest, 'count': len(additions)})
    manifest['through'] = today.isoformat()
    temp = path.with_suffix('.json.tmp')
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)
    print(f'TJ releases through {today}: {len(additions)} new songs; {len(codes) + len(additions)} catalog songs.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--if-due', action='store_true')
    collect(ROOT, datetime.now(KST).date(), parser.parse_args().if_due)
