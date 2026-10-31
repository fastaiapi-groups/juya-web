#!/usr/bin/env python3
"""Fill first-run settings without evaluating dotenv as shell code or rotating passwords."""
import argparse
import os
from pathlib import Path
import re
import secrets
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('--env-file', required=True)
parser.add_argument('--example', required=True)
parser.add_argument('--database-exists', action='store_true')
parser.add_argument('--project-name', action='store_true')
args = parser.parse_args()
path = Path(args.env_file)
text = path.read_text() if path.exists() else ''

def read_value(name):
    if name in os.environ:
        return os.environ[name]
    matches = re.findall(r'^[ \t]*' + re.escape(name) + r'[ \t]*=[ \t]*(.*?)[ \t]*$', text, re.M)
    value = matches[-1] if matches else ''
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('\"', "'"):
        value = value[1:-1]
    return value

if args.project_name:
    project = read_value('COMPOSE_PROJECT_NAME') or 'fastai-website'
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', project):
        raise SystemExit('COMPOSE_PROJECT_NAME 格式不正确')
    print(project)
    raise SystemExit(0)

if args.database_exists and not read_value('POSTGRES_PASSWORD'):
    raise SystemExit('已有 PostgreSQL 数据卷，但未配置 POSTGRES_PASSWORD；请恢复原密码，脚本不会重建数据库或生成替代密码。')
if not path.exists():
    path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.example, path)
    text = path.read_text()
path.chmod(0o600)

settings = {
    'POSTGRES_USER': lambda: 'merchant',
    'POSTGRES_DB': lambda: 'merchant',
    'POSTGRES_PASSWORD': lambda: secrets.token_hex(32),
    'MERCHANT_ADMIN_USERNAME': lambda: 'admin',
    'MERCHANT_ADMIN_PASSWORD': lambda: secrets.token_urlsafe(32),
    'MERCHANT_SECURE_COOKIES': lambda: 'true',
    'MERCHANT_PUBLIC_ORIGIN': lambda: 'https://home.fastaiapi.cloud',
}
changed = False
for name, factory in settings.items():
    if name == 'MERCHANT_PUBLIC_ORIGIN' and (name in os.environ or re.search(r'^[ \t]*' + name + r'[ \t]*=', text, re.M)):
        continue
    if read_value(name):
        continue
    value = factory()
    pattern = re.compile(r'^[ \t]*' + re.escape(name) + r'[ \t]*=.*$', re.M)
    if pattern.search(text):
        text = pattern.sub(name + '=' + value, text)
    else:
        text = text.rstrip('\n') + '\n' + name + '=' + value + '\n'
    changed = True
if changed:
    path.write_text(text)
path.chmod(0o600)
print('配置已检查；数据库和管理员初始密码保存在私有环境配置文件中。')
