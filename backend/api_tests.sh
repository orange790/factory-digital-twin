#!/bin/bash
# 后端接口全链路验收脚本（临时工具，验证后删除）
B=http://127.0.0.1:8000/api
J='Content-Type: application/json'

T=$(curl -s -X POST $B/auth/login/ -H "$J" -d '{"username":"admin","password":"admin123"}' | sed -E 's/.*"access":"([^"]+)".*/\1/')
A="Authorization: Token $T"
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
FAIL=0

echo "== 1. 设备树 =="
curl -s -H "$A" $B/devices/tree/ | python -c "
import sys,json
d=json.load(sys.stdin)
print('  车间数', len(d))
print('  首车间', d[0]['name'], '产线', len(d[0]['lines']), '设备', len(d[0]['lines'][0]['devices']))
"

echo "== 2. 设备详情 + 指标序列 =="
DID=$(curl -s -H "$A" "$B/devices/?search=M07" | python -c "import sys,json;d=json.load(sys.stdin);print(d['results'][0]['id'] if d['results'] else 0)")
echo "  设备ID=$DID"
curl -s -H "$A" "$B/devices/$DID/metrics/?hours=24" | python -c "
import sys,json
d=json.load(sys.stdin)
print('  指标点', len(d.get('history',[])), 'key', d.get('key'))
"
curl -s -H "$A" "$B/devices/status-logs/" | python -c "import sys,json;d=json.load(sys.stdin);print('  状态日志', len(d))"

echo "== 3. 告警 ack -> close =="
AID=$(curl -s -H "$A" "$B/alarms/?status=active" | python -c "import sys,json;print(json.load(sys.stdin)['results'][0]['id'])")
curl -s -o /tmp/a1.json -w "  ack   HTTP %{http_code}\n" -X POST -H "$A" -H "$J" $B/alarms/$AID/ack/ -d '{"remark":"测试确认"}'
cat /tmp/a1.json | python -c "import sys,json;d=json.load(sys.stdin);print('  status=',d.get('status'),'ack_by=',d.get('ack_by'))"
curl -s -o /tmp/a2.json -w "  close HTTP %{http_code}\n" -X POST -H "$A" -H "$J" $B/alarms/$AID/close/ -d '{"remark":"测试关闭"}'
cat /tmp/a2.json | python -c "import sys,json;d=json.load(sys.stdin);print('  status=',d.get('status'),'closed_at=',d.get('closed_at'))"

echo "== 4. 用户角色权限（guest 禁止改设备） =="
TG=$(curl -s -X POST $B/auth/login/ -H "$J" -d '{"username":"demo","password":"demo"}' | sed -E 's/.*"access":"([^"]+)".*/\1/')
echo -n "  guest 创建告警规则 -> "
curl -s -o /dev/null -w "HTTP %{http_code} (期望 403)\n" -X POST -H "Authorization: Token $TG" -H "$J" $B/alarm-rules/ -d '{"device_type":"machine","metric_key":"temperature","operator":">","threshold":99,"level":"warn"}'

echo "== 5. 工单流转 pending -> assigned -> processing -> closed =="
WID=$(curl -s -H "$A" "$B/workorders/?status=pending" | python -c "import sys,json;d=json.load(sys.stdin);print(d['results'][0]['id'] if d['results'] else 0)")
echo "  工单ID=$WID"
for S in assigned processing closed; do
  R=$(curl -s -X POST -H "$A" -H "$J" $B/workorders/$WID/transition/ -d "{\"to_status\":\"$S\",\"assignee\":\"张伟\",\"result\":\"已处理\"}" -w "|%{http_code}")
  CODE=${R##*|}
  ST=$(echo "${R%|*}" | python -c "import sys,json;print(json.load(sys.stdin).get('status'))" 2>/dev/null)
  [ "$CODE" = "200" ] && ok "-> $S (status=$ST)" || bad "-> $S HTTP $CODE"
done

echo "== 6. 非法流转应被拒绝 =="
curl -s -o /dev/null -w "  closed->processing HTTP %{http_code} (期望 400)\n" -X POST -H "$A" -H "$J" $B/workorders/$WID/transition/ -d '{"to_status":"processing"}'

echo "== 7. 巡检任务提交（异常项自动建单） =="
TID=$(curl -s -H "$A" "$B/inspection/tasks/" | python -c "import sys,json;d=json.load(sys.stdin);r=d['results'] if isinstance(d,dict) else d;print(r[0]['id'] if r else 0)")
RID=$(curl -s -H "$A" "$B/inspection/tasks/" | python -c "import sys,json;d=json.load(sys.stdin);r=d['results'] if isinstance(d,dict) else d;print(r[0]['route_id'] if r else 0)")
PID=$(curl -s -H "$A" "$B/inspection/routes/" | python -c "import sys,json;d=json.load(sys.stdin);r=[x for x in d if x['id']==$RID];print(r[0]['points'][0]['id'] if r else 0)")
echo "  任务ID=$TID 路线=$RID 点位=$PID"
curl -s -o /tmp/i.json -w "  submit HTTP %{http_code}\n" -X POST -H "$A" -H "$J" $B/inspection/tasks/$TID/submit/ \
  -d "{\"items\":[{\"point_id\":$PID,\"is_abnormal\":true,\"result\":{\"ok\":false},\"remark\":\"皮带磨损\"}],\"remark\":\"测试提交\"}"
cat /tmp/i.json | python -c "import sys,json;d=json.load(sys.stdin);print('  keys',list(d.keys())[:6])" 2>/dev/null

echo "== 8. 场景配置 =="
curl -s -H "$A" $B/scene/config/ | python -c "import sys,json;d=json.load(sys.stdin);print('  图层键', list(d.get('layer_visible',{}).keys()));print('  预设', [p['name'] for p in d.get('camera_presets',[])])"
echo -n "  guest 改配置 -> "
curl -s -o /dev/null -w "HTTP %{http_code} (期望 403)\n" -X PUT -H "Authorization: Token $TG" -H "$J" $B/scene/config/ -d '{"status_colors":{}}'

echo "== 9. CSV 导出（BOM） =="
curl -s -H "$A" $B/report/alarm/export/ -o /tmp/e.csv -w "  HTTP %{http_code} size %{size_download}B\n"
head -c 3 /tmp/e.csv | xxd | head -1
head -2 /tmp/e.csv | tail -1 | cut -c1-120

echo "== 10. 操作日志 =="
curl -s -H "$A" $B/logs/ | python -c "import sys,json;d=json.load(sys.stdin);r=d['results'] if isinstance(d,dict) else d;print('  日志条数', len(r));[print('   ',x['action'],x.get('target','')[:40]) for x in r[:4]]"

echo
echo "失败项：$FAIL"
