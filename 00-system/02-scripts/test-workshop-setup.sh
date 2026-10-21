#!/usr/bin/env bash
# 실제 설치 스크립트를 /private/tmp fixture에서 실행한다. 테스트에만 Python 3이 필요하다.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
python3 - "$REPO_ROOT" <<'PY'
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile

repo = Path(sys.argv[1])
required = [
    'SKILL.md', 'skills/company-research/SKILL.md', 'skills/job-scout/SKILL.md',
    'skills/experience-extract/SKILL.md', 'skills/application-build/SKILL.md',
    'agents/research.md', 'agents/experience.md', 'agents/writing.md', 'references/runtime-contract.md',
]
# HOME/CODEX_HOME은 재지정하지 않는다. 자식 Bash는 시작 파일을 로드하지 않으며
# CLI/네트워크/개발자도구는 기록 후 실패하는 실행 파일로 차단한다.
original_home = os.environ.get('HOME')
pwsh = shutil.which('pwsh') or shutil.which('powershell')
results = []


def snapshot(root):
    result = {}
    for path in sorted(root.rglob('*')):
        info = path.lstat()
        key = str(path.relative_to(root))
        if path.is_symlink():
            content = ('link', os.readlink(path))
        elif path.is_file():
            content = ('file', hashlib.sha256(path.read_bytes()).hexdigest())
        else:
            content = ('dir',)
        result[key] = (content, stat.S_IMODE(info.st_mode), info.st_mtime_ns)
    return result


def write_executable(path, content):
    if path.is_symlink():
        path.unlink()
    path.write_text('#!/bin/bash\n' + content)
    path.chmod(0o755)


@contextlib.contextmanager
def fixture(label):
    with tempfile.TemporaryDirectory(prefix='workshop-test-', dir='/private/tmp') as temporary:
        fixture_root = Path(temporary)
        workspace = fixture_root / (label + ' workspace with spaces')
        workspace.mkdir()
        (workspace / '00-system/02-scripts').mkdir(parents=True)
        for name in ('install.sh', 'install.ps1'):
            shutil.copy2(repo / name, workspace / name)
        for name in ('setup-workshop.sh', 'setup-workshop.ps1', 'plugins.txt', 'ensure-wiki-runtime.sh', 'ensure-wiki-runtime.ps1', 'node-runtime-manifest.txt', 'run-wiki.sh', 'run-wiki.ps1'):
            shutil.copy2(repo / '00-system/02-scripts' / name, workspace / '00-system/02-scripts' / name)
        for name in ('career-os', 'skill-creator', 'karpathy-llm-wiki'):
            shutil.copytree(repo / '.claude/skills' / name, workspace / '.claude/skills' / name)
        shutil.copytree(repo / '00-system/wiki-app', workspace / '00-system/wiki-app')
        (workspace / '.claude/commands').mkdir()
        (workspace / '.claude/commands/setup-workspace.md').write_text('fixture command\n')
        (workspace / 'CLAUDE.md').write_text('personal Claude settings\n')
        (workspace / 'AGENTS.md').write_text('personal Codex settings\n')
        (workspace / '.claude/skills/unrelated').mkdir()
        (workspace / '.claude/skills/unrelated/SKILL.md').write_text('personal skill\n')
        # 전체 묶음 복사를 검증한다. 고정된 필수 9개만 복사하면 이 테스트가 실패한다.
        bundle = workspace / '.claude/skills/career-os'
        (bundle / 'assets').mkdir()
        (bundle / 'assets/raw.bin').write_bytes(bytes(range(256)))
        (bundle / '.bundled-note').write_text('hidden bundle content\n')
        tool_bin = fixture_root / 'tools'
        tool_bin.mkdir()
        for command in ('bash', 'uname', 'dirname', 'cat', 'cmp', 'cp', 'mv', 'mktemp', 'rm', 'rmdir', 'mkdir', 'sed', 'awk', 'tr', 'grep', 'head'):
            executable = shutil.which(command)
            if not executable:
                raise AssertionError('test requires: ' + command)
            (tool_bin / command).symlink_to(executable)
        write_executable(tool_bin / 'node', 'if [ "$1" = "--version" ]; then printf "v22.0.0\\n"; else printf "22\\n"; fi\n')
        log = fixture_root / 'forbidden-commands.log'
        for command in ('git', 'claude', 'codex', 'curl', 'wget', 'winget', 'xcode-select'):
            write_executable(tool_bin / command, 'printf "%s\\n" "' + command + ' $*" >> "$WORKSHOP_TEST_LOG"\nexit 97\n')
        environment = dict(os.environ)
        environment.update(PATH=str(tool_bin), WORKSHOP_TEST_LOG=str(log))
        environment.pop('BASH_ENV', None)
        environment.pop('ENV', None)
        yield workspace, fixture_root, tool_bin, log, environment


def run(workspace, environment, args, backend='bash', helper=False):
    if backend == 'bash':
        script = workspace / ('00-system/02-scripts/setup-workshop.sh' if helper else 'install.sh')
        command = ['/bin/bash', '--noprofile', '--norc', str(script)] + args
    else:
        script = workspace / ('00-system/02-scripts/setup-workshop.ps1' if helper else 'install.ps1')
        mapping = {'--workshop': '-Workshop', '--tool': '-Tool', '--check': '-Check', '--yes': '-Yes', '--help': '-Help'}
        command = [pwsh, '-NoLogo', '-NoProfile', '-NonInteractive', '-File', str(script)] + [mapping.get(a, a) for a in args]
    return subprocess.run(command, cwd=workspace, env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)


def expect(process, success=True, text=None):
    assert (process.returncode == 0) == success, (process.returncode, process.stdout)
    if text is not None:
        assert text in process.stdout, process.stdout


def assert_offline(log):
    assert not log.exists(), log.read_text() if log.exists() else ''


def verify_pack(workspace):
    original = workspace / '.claude/skills/career-os'
    target = workspace / '.agents/skills/career-os'
    original_files = {str(p.relative_to(original)): p.read_bytes() for p in original.rglob('*') if p.is_file()}
    target_files = {str(p.relative_to(target)): p.read_bytes() for p in target.rglob('*') if p.is_file()}
    assert original_files == target_files
    assert all((target / relative).is_file() for relative in required)
    wiki_original = workspace / '.claude/skills/karpathy-llm-wiki'
    wiki_target = workspace / '.agents/skills/karpathy-llm-wiki'
    assert {str(p.relative_to(wiki_original)): p.read_bytes() for p in wiki_original.rglob('*') if p.is_file()} == {str(p.relative_to(wiki_target)): p.read_bytes() for p in wiki_target.rglob('*') if p.is_file()}
    assert not (workspace / '.agents/skills/skill-creator').exists()
    for path in target.rglob('*.md'):
        content = path.read_text()
        references = re.findall(r'\]\(([^)]+\.md(?:#[^)]*)?)\)', content)
        if path == target / 'SKILL.md':
            references += re.findall(r'`((?:skills|agents)/[^`]+\.md)`', content)
        for reference in references:
            reference = reference.split('#', 1)[0]
            if '://' not in reference:
                resolved = path.parent / reference
                assert resolved.is_file(), (str(path), reference)
                resolved.read_bytes()


def test_fresh_claude(backend):
    with fixture('fresh Claude') as (workspace, _, _, log, environment):
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'claude', '--yes'], backend), text='skill-creator')
        assert snapshot(workspace) == before
        assert not (workspace / '.agents').exists()
        assert_offline(log)


def test_fresh_codex(backend):
    with fixture('fresh Codex') as (workspace, _, _, log, environment):
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'codex', '--yes'], backend), text='skill-creator')
        verify_pack(workspace)
        after = snapshot(workspace)
        for path, value in before.items():
            assert after[path] == value, path
        assert all(path in before or path == '.agents' or path.startswith('.agents/') for path in after)
        assert not list(workspace.glob('.workshop-skills.*'))
        assert_offline(log)


def test_rerun_and_ready_check(backend):
    with fixture('rerun') as (workspace, _, _, log, environment):
        arguments = ['--workshop', '--tool', 'codex']
        expect(run(workspace, environment, arguments, backend))
        before = snapshot(workspace)
        expect(run(workspace, environment, arguments + ['--yes'], backend))
        assert snapshot(workspace) == before
        expect(run(workspace, environment, arguments + ['--check'], backend))
        assert snapshot(workspace) == before
        assert_offline(log)


def test_missing_check(backend):
    with fixture('missing check') as (workspace, _, _, log, environment):
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'codex', '--check'], backend), False, '.agents')
        assert snapshot(workspace) == before
        assert_offline(log)


def test_missing_source(backend):
    for tool, relative in [('codex', 'career-os/' + name) for name in required] + [('claude', 'skill-creator/SKILL.md'), ('claude', 'skill-creator/scripts/quick_validate.py'), ('codex', 'karpathy-llm-wiki/SKILL.md'), ('claude', 'karpathy-llm-wiki/references/workshop.md'), ('codex', 'karpathy-llm-wiki/scripts/check_evidence.py')]:
        with fixture('missing source') as (workspace, _, _, log, environment):
            (workspace / '.claude/skills' / relative).unlink()
            before = snapshot(workspace)
            expect(run(workspace, environment, ['--workshop', '--tool', tool], backend), False, relative)
            assert snapshot(workspace) == before
            assert not (workspace / '.agents').exists()
            assert_offline(log)


def test_personal_conflict(backend):
    with fixture('personal conflict') as (workspace, _, _, log, environment):
        target = workspace / '.agents/skills/career-os'
        shutil.copytree(workspace / '.claude/skills/career-os', target)
        (target / 'agents/writing.md').write_bytes(b'PERSONAL CHANGES\x00\xff')
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'codex'], backend), False, 'agents')
        assert snapshot(workspace) == before
        assert (target / 'agents/writing.md').read_bytes() == b'PERSONAL CHANGES\x00\xff'
        assert_offline(log)


def test_personal_extra(backend):
    with fixture('personal extra') as (workspace, _, _, log, environment):
        expect(run(workspace, environment, ['--workshop', '--tool', 'codex'], backend))
        target = workspace / '.agents/skills/career-os'
        (target / 'my-notes').mkdir()
        (target / 'my-notes/personal.md').write_text('keep my notes\n')
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'codex'], backend))
        assert snapshot(workspace) == before
        assert_offline(log)


def test_symlink_block(backend):
    for relative in ('.agents', '.agents/skills', '.agents/skills/career-os', '.agents/skills/karpathy-llm-wiki'):
        with fixture('symlink ancestor') as (workspace, fixture_root, _, log, environment):
            outside = fixture_root / 'outside'
            outside.mkdir()
            (outside / 'sentinel').write_text('outside unchanged\n')
            link = workspace / relative
            link.parent.mkdir(parents=True, exist_ok=True)
            link.symlink_to(outside, target_is_directory=True)
            before, external_before = snapshot(workspace), snapshot(outside)
            expect(run(workspace, environment, ['--workshop', '--tool', 'codex'], backend), False, relative)
            assert snapshot(workspace) == before
            assert snapshot(outside) == external_before
            assert_offline(log)


def test_arguments(backend):
    with fixture('arguments') as (workspace, _, _, log, environment):
        before = snapshot(workspace)
        for arguments in (['--workshop'], ['--workshop', '--tool', 'unknown'], ['--tool', 'codex'], ['--workshop', '--tool'], ['--workshop', '--tool', 'codex', '--unknown']):
            expect(run(workspace, environment, arguments, backend), False)
        for arguments in ([], ['--tool', 'unknown'], ['--tool'], ['--tool', 'codex', '--unknown']):
            expect(run(workspace, environment, arguments, backend, helper=True), False)
        expect(run(workspace, environment, ['--help'], backend))
        expect(run(workspace, environment, ['--help'], backend, helper=True))
        assert snapshot(workspace) == before
        assert_offline(log)


def test_copy_failures(_):
    for operation in ('copy fails', 'copy corrupts', 'move fails', 'second move fails'):
        with fixture(operation) as (workspace, _, tool_bin, log, environment):
            if operation == 'copy fails':
                command, body = 'cp', 'mkdir -p "$3"\nprintf partial > "$3/SKILL.md"\nexit 23\n'
            elif operation == 'copy corrupts':
                command, body = 'cp', '"$WORKSHOP_TEST_REAL_CP" "$@"\nprintf corrupt > "$3/references/runtime-contract.md"\n'
                environment['WORKSHOP_TEST_REAL_CP'] = shutil.which('cp')
            elif operation == 'second move fails':
                command, body = 'mv', 'case "$2" in *karpathy-llm-wiki) exit 24 ;; esac\n"$WORKSHOP_TEST_REAL_MV" "$@"\n'
                environment['WORKSHOP_TEST_REAL_MV'] = shutil.which('mv')
            else:
                command, body = 'mv', 'exit 24\n'
            (tool_bin / command).unlink()
            write_executable(tool_bin / command, body)
            before = snapshot(workspace)
            process = run(workspace, environment, ['--workshop', '--tool', 'codex'])
            expect(process, False)
            assert '파일 준비 확인:' not in process.stdout, process.stdout
            after = snapshot(workspace)
            assert after == before, (operation, [key for key in set(before) | set(after) if before.get(key) != after.get(key)], process.stdout)
            assert_offline(log)



def test_wiki_conflict(backend):
    with fixture('wiki personal conflict') as (workspace, _, _, log, environment):
        target = workspace / '.agents/skills/karpathy-llm-wiki'
        shutil.copytree(workspace / '.claude/skills/karpathy-llm-wiki', target)
        (target / 'SKILL.md').write_text('MY LEARNING STYLE\n')
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'codex'], backend), False, 'karpathy-llm-wiki')
        assert snapshot(workspace) == before
        assert not (workspace / '.agents/skills/career-os').exists()
        assert_offline(log)


def test_missing_app(backend):
    with fixture('missing wiki app') as (workspace, _, _, log, environment):
        (workspace / '00-system/wiki-app/server.mjs').unlink()
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'codex'], backend), False, 'server.mjs')
        assert snapshot(workspace) == before
        assert_offline(log)


def test_runtime_reporting(backend):
    with fixture('wiki runtime') as (workspace, _, tool_bin, log, environment):
        (tool_bin / 'node').unlink()
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--workshop', '--tool', 'claude', '--check'], backend), False, '위키 실행 환경 미준비')
        write_executable(tool_bin / 'node', 'if [ "$1" = "--version" ]; then printf "v18.0.0\\n"; else printf "18\\n"; fi\n')
        expect(run(workspace, environment, ['--workshop', '--tool', 'claude', '--check'], backend), False, '위키 실행 환경 미준비')
        write_executable(tool_bin / 'node', 'if [ "$1" = "--version" ]; then printf "v22.0.0\\n"; else printf "22\\n"; fi\n')
        expect(run(workspace, environment, ['--workshop', '--tool', 'claude', '--check'], backend), text='위키 실행 환경 준비 확인:')
        assert snapshot(workspace) == before
        assert_offline(log)


def test_legacy(_):
    with fixture('legacy') as (workspace, fixture_root, tool_bin, log, environment):
        expect(run(workspace, environment, ['--help']), text='--workshop')
        assert_offline(log)
        # 실제 CLI를 실행하지 않는다. 기존 --check의 호출만 fixture CLI가 기록한다.
        plugins = [line.split()[1] for line in (workspace / '00-system/02-scripts/plugins.txt').read_text().splitlines() if line.startswith('plugin ')]
        listing = fixture_root / 'plugins.json'
        listing.write_text(json.dumps([{'id': value} for value in plugins]))
        environment['WORKSHOP_TEST_PLUGIN_LIST'] = str(listing)
        write_executable(tool_bin / 'uname', 'printf "Linux\\n"\n')
        write_executable(tool_bin / 'claude', 'printf "%s\\n" "claude $*" >> "$WORKSHOP_TEST_LOG"\ncase "$*" in\n  --version) printf "fixture CLI\\n" ;;\n  "plugin list --json") cat "$WORKSHOP_TEST_PLUGIN_LIST" ;;\n  *) exit 98 ;;\nesac\n')
        before = snapshot(workspace)
        expect(run(workspace, environment, ['--check', '--yes']), text='/setup-workspace --work')
        assert snapshot(workspace) == before
        assert log.read_text().splitlines() == ['claude --version', 'claude plugin list --json']



def test_launcher_runtime(_):
    with fixture('launcher') as (workspace, fixture_root, tool_bin, log, environment):
        prepared = fixture_root / 'prepared node with spaces'
        prepared.mkdir()
        runtime = prepared / 'node'
        arguments = fixture_root / 'launcher-arguments.txt'
        environment['WORKSHOP_TEST_RUNTIME_NODE'] = str(runtime)
        environment['WORKSHOP_TEST_LAUNCHER_ARGS'] = str(arguments)
        write_executable(runtime, 'case "$1" in\n  */server.mjs) shift; printf "%s\\n" "$@" > "$WORKSHOP_TEST_LAUNCHER_ARGS"; codex --version ;;\n  */codex) printf "prepared-node-cli-ok\\n" ;;\n  *) exit 98 ;;\nesac\n')
        write_executable(tool_bin / 'codex', 'unused\n')
        (tool_bin / 'codex').write_text('#!/usr/bin/env node\n')
        write_executable(workspace / '00-system/02-scripts/ensure-wiki-runtime.sh', 'printf "%s\\n" "$WORKSHOP_TEST_RUNTIME_NODE"\n')
        result = subprocess.run(['/bin/bash', str(workspace / '00-system/02-scripts/run-wiki.sh'), '--root', 'my notes with spaces', '--port', '3181'], cwd=fixture_root, env=environment, text=True, capture_output=True)
        expect(result, text='prepared-node-cli-ok')
        assert arguments.read_text().splitlines() == ['--root', 'my notes with spaces', '--port', '3181']
        assert environment['PATH'] == str(tool_bin)
        assert_offline(log)


def test_windows_command_contract(_):
    install_ps = (repo / 'install.ps1').read_text(encoding='utf-8-sig')
    helper_ps = (repo / '00-system/02-scripts/setup-workshop.ps1').read_text(encoding='utf-8-sig')
    for source in (install_ps, helper_ps):
        examples = re.findall(r"\bpowershell\s+-[^'\"\n]+", source, re.IGNORECASE)
        assert examples, 'PowerShell command examples are missing'
        for command in examples:
            assert '-NoProfile' in command and '-ExecutionPolicy Bypass' in command and '-File' in command, command
        assert not re.search(r'\bSet-ExecutionPolicy\b', source, re.IGNORECASE)
    install_sh = (repo / 'install.sh').read_text()
    for source in (install_sh, install_ps):
        assert '2. /setup-workspace --work 를 입력하세요' in source
        assert not re.search(r'/setup-workspace(?![.]| --work)', source)
    assert '.claude/commands/setup-workspace.md' in install_sh
    assert '.claude\\commands\\setup-workspace.md' in install_ps


def check(name, function, backend):
    try:
        function(backend)
        results.append(True)
        print('PASS ' + backend + ': ' + name, flush=True)
    except Exception as error:
        results.append(False)
        print('FAIL ' + backend + ': ' + name + ': ' + repr(error), flush=True)


cases = [
    ('fresh Claude offline / no CLI / no Git', test_fresh_claude),
    ('fresh Codex full pack bytes / relative refs / spaces', test_fresh_codex),
    ('identical rerun and ready --check write nothing', test_rerun_and_ready_check),
    ('missing --check writes nothing', test_missing_check),
    ('missing source fails before mutation', test_missing_source),
    ('personal destination conflict preserves bytes', test_personal_conflict),
    ('wiki conflict preflight preserves career and personal wiki', test_wiki_conflict),
    ('missing app fails before mutation', test_missing_app),
    ('runtime check rejects missing/old Node without writes or network', test_runtime_reporting),
    ('personal extra files survive identical rerun', test_personal_extra),
    ('symlink ancestors block external writes', test_symlink_block),
    ('entry/helper invalid flags and help', test_arguments),
]
for backend in ['bash'] + (['powershell'] if pwsh else []):
    for name, function in cases:
        check(name, function, backend)
check('staging copy error / corruption / move error clean up', test_copy_failures, 'bash')
check('legacy --help / --check / --yes routing', test_legacy, 'bash')
check('launcher passes selected runtime to npm CLI without changing caller PATH', test_launcher_runtime, 'bash')
check('Windows process policy command / company --work contract', test_windows_command_contract, 'static')
if not pwsh:
    print('SKIP PowerShell: pwsh/powershell unavailable; Windows runtime remains unverified.')
assert os.environ.get('HOME') == original_home
print('Evidence: /private/tmp fixtures only; Bash --noprofile --norc; HOME/CODEX_HOME unchanged; forbidden CLI/network sentinels; complete workspace snapshots.')
print('Results: {} passed, {} failed'.format(sum(results), len(results) - sum(results)))
sys.exit(0 if all(results) else 1)
PY
