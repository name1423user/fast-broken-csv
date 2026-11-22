#!/bin/bash
# gVisor 計測環境の再現（Mac 上で実行）。colima の VM（vz・2vCPU・4GB）に runsc（aarch64、release 20261102）を登録し、
# 計測一式を VM の /opt/bench に置く。その後: colima ssh -- bash /opt/bench/run.sh 500 > results.csv; node scripts/gvisor/analyze.mjs results.csv
set -euo pipefail
cd "$(dirname "$0")/../.."
KIT=kit-dl/csv-reader-speed-01-run-20261121-kit
SHA=574b5775b4417618f63c8506e6bb237e370df85722832a5d0c3831382155e55e59d4cfa993a1e9bbe1b1cf04346ffd48b20aaa879c6ed9a52c680f762fd19980
command -v colima >/dev/null || brew install colima
colima status >/dev/null 2>&1 || colima start --runtime docker --vm-type vz --cpu 2 --memory 4 --disk 30
docker context use desktop-linux >/dev/null 2>&1 || true   # 既定は Docker Desktop のまま（grade-local は runc で回す）
colima ssh -- bash -s "$SHA" <<'VM'
set -euo pipefail
[ -x /usr/local/bin/gvisor-bin/gvisor_sentry ] && exit 0
d=$(mktemp -d); cd $d
curl -fsSLO https://storage.googleapis.com/gvisor/releases/release/20261102/aarch64/gvisor.tar.bz2
echo "$1  gvisor.tar.bz2" | sha512sum -c -
python3 -c 'import tarfile;tarfile.open("gvisor.tar.bz2").extractall("x",filter="data")'
sudo install -m 755 x/runsc x/containerd-shim-runsc-v1 /usr/local/bin/
sudo mkdir -p /usr/local/bin/gvisor-bin && sudo install -m 755 x/gvisor-bin/* /usr/local/bin/gvisor-bin/
VM
grep -q 'runsc:' ~/.colima/default/colima.yaml || {
  sed -i '' 's|^docker: {}$|docker:\n  runtimes:\n    runsc:\n      path: /usr/local/bin/runsc|' ~/.colima/default/colima.yaml
  colima restart; docker context use desktop-linux >/dev/null 2>&1 || true; }
# 計測一式（現行版はコミット指定、既定 HEAD）と期待出力
t=$(mktemp -d); mkdir -p $t/bots/cur $t/input
cp -R scripts/gvisor/{run.sh,launch.pl,bots} $t/; git archive "${1:-HEAD}" main.ts transducer.js solve.js | tar -x -C $t/bots/cur
cp $KIT/practice/input/cases.json $t/input/
MAKEFUN_INPUT_DIR=$t/input MAKEFUN_OUTPUT_DIR=$t node $t/bots/cur/main.ts && mv $t/answers.json $t/expected.json
colima ssh -- sudo sh -c 'rm -rf /opt/bench && mkdir -p /opt/bench && chown $SUDO_USER /opt/bench'
COPYFILE_DISABLE=1 tar --no-xattrs -C $t -cf - . | colima ssh -- tar -xf - -C /opt/bench
rm -rf $t
