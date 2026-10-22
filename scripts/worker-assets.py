"""Build a manifest or upload using a scoped, short-lived JWT supplied on stdin.
Never persists or logs tokens. Cloudflare's connected app supplies account access.
"""
import base64, hashlib, json, mimetypes, pathlib, sys, urllib.request, urllib.error
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'out'
ACCOUNT = 'e9922d90d4223d8522e44cb000c5d608'
def files():
    return {('/' + str(p.relative_to(ROOT))): {'hash': hashlib.sha256(p.read_bytes()).hexdigest()[:32], 'size': p.stat().st_size} for p in sorted(ROOT.rglob('*')) if p.is_file() and p.name not in ('_headers','_redirects')}
if len(sys.argv)>1 and sys.argv[1]=='manifest':
    print(json.dumps(files()));sys.exit(0)
# A PTY makes stdin available for the owning tool call. Disable echo before input.
if sys.stdin.isatty():
    import termios
    attrs=termios.tcgetattr(sys.stdin);attrs[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,attrs)
print('Ready for upload session on stdin',flush=True)
payload=json.loads(sys.stdin.readline())
manifest=files();lookup={value['hash']:ROOT/key.lstrip('/') for key,value in manifest.items()}
completion=payload['jwt'] if not payload['buckets'] else None
for bucket in payload['buckets']:
    boundary='TodoAssetsBoundary';parts=[]
    for digest in bucket:
        path=lookup[digest];mime=mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
        if path.suffix=='.js':mime='application/javascript'
        if path.suffix=='.webmanifest':mime='application/manifest+json'
        parts.extend([f'--{boundary}',f'Content-Disposition: form-data; name="{digest}"; filename="{digest}"',f'Content-Type: {mime}','',base64.b64encode(path.read_bytes()).decode()])
    parts.extend([f'--{boundary}--',''])
    request=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/workers/assets/upload?base64=true',data='\r\n'.join(parts).encode(),headers={'Authorization':'Bearer '+payload['jwt'],'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
    try:
        with urllib.request.urlopen(request,timeout=60) as response:
            result=json.load(response)
            if not result.get('success'):raise RuntimeError('Cloudflare rejected asset upload')
            completion=result.get('result',{}).get('jwt',completion)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Asset upload failed with HTTP {error.code}') from None
if not completion:raise RuntimeError('Upload did not return completion token')
# Result is consumed by the owning execution cell and is never forwarded to chat.
print(json.dumps({'jwt':completion}),flush=True)
