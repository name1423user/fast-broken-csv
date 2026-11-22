#!/bin/bash
# VM 内で実行: bash run.sh <周回数> [版,版,...（既定 null,read,rw,cur）] [runc,runsc] > results.csv。1周目は捨て周（round=0）。
# 各周で 版×ランタイム の順をシャッフル。床（null read rw spin）以外の版は毎回 expected.json とバイト比較する。
set -u
B=/opt/bench; N=$1
BOTS=$(echo "${2:-null,read,rw,cur}" | tr , " "); RTS=$(echo "${3:-runc,runsc}" | tr , " ")
JOBS=$(for rt in $RTS; do for b in $BOTS; do echo $rt:$b; done; done)
IMG='node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d'
echo "round,runtime,bot,cpu_us,status,steal_ticks,load1"
for r in $(seq 0 $N); do
  for job in $(echo "$JOBS" | shuf); do
    rt=${job%%:*}; bot=${job#*:}
    out=$(mktemp -d /opt/bench/out.XXXX); chmod 777 $out
    st0=$(awk '/^cpu /{print $9}' /proc/stat)
    line=$(docker run --rm --runtime=$rt --cpus=1 --memory=1g --pids-limit=64 --network none \
      -v $B/bots/$bot:/bot:ro -v $B/input:/input:ro -v $out:/output -v $B/launch.pl:/launch.pl:ro \
      $IMG perl /launch.pl node /bot/main.ts 2>&1 | grep '^CPU ' | tail -1)
    st1=$(awk '/^cpu /{print $9}' /proc/stat)
    case $bot in null|read|rw|spin) ;; *) if ! cmp -s $out/answers.json $B/expected.json; then line="CPU -1 mismatch"; fi;; esac
    rm -rf $out
    set -- $line
    echo "$r,$rt,$bot,${2:-NA},${3:-NA},$((st1-st0)),$(cut -d' ' -f1 /proc/loadavg)"
  done
done
