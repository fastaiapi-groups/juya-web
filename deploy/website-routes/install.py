from pathlib import Path
from datetime import datetime, timezone
import re
import sys
p = Path(sys.argv[1]) if len(sys.argv) == 2 else Path('/etc/caddy/sites/dev.caddy')
s = p.read_text()
if '# website-consolidation-v1' in s:
    print('Website routes already installed')
    raise SystemExit
routes = '''    # website-consolidation-v1; source: fastai-website/deploy/website-routes
    @website path /fastaiui /fastaiui/* /fastaiapi /fastaiapi/* /help /help/* /downloads /downloads/* /merchant /merchant/* /api/merchant/* /api/cards/check /api/activate /api/verify /site-config.json
    handle @website {
        reverse_proxy 192.200.102.214:6660 {
            import common_proxy_headers
        }
    }
'''
# Scoped edits, with exact matches to detect unexpected live drift.
a=s.index('fastaiapi.cloud, www.fastaiapi.cloud {')
b=s.index('\nxiaopi.fastaiapi.cloud {',a)
block=s[a:b]
old=re.compile(r'    @public_help path .*?\n    handle @design \{\n.*?\n    \}\n',re.S)
block,n=old.subn(routes,block)
assert n==1, 'Unexpected existing fastaiapi handlers'
# fastaiapi gains the same /hub/home landing and Android route as other lines.
block=block.replace('    handle {', '''    redir /hub/home /hub/home/ 308
    handle_path /hub/home/* {
        reverse_proxy 192.200.102.214:1136 {
            import common_proxy_headers
        }
    }
    handle {''',1)
s=s[:a]+block+s[b:]
a=s.index('\napi.fastaiapi.cloud {')
b=s.index('\ntumeiapi.com, www.tumeiapi.com {',a)
block=s[a:b]
block=block.replace('    @retired_manju path',routes+'    @retired_manju path',1)
s=s[:a]+block+s[b:]
a=s.index('\ntumeiapi.com, www.tumeiapi.com {')
b=s.index('\nregist.tumeiapi.com {',a)
block=s[a:b]
assert 'reverse_proxy 192.200.102.214:1111' in block
block='''
tumeiapi.com, www.tumeiapi.com {
    import access_log
'''+routes+'''    handle {
        reverse_proxy 192.200.102.214:1111 {
            import common_proxy_headers
        }
    }
}
'''
s=s[:a]+block+s[b:]
backup=p.with_name('dev.caddy.before-website-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.write_text(p.read_text())
p.write_text(s)
print('Website routes prepared; backup:',backup)
