#!/usr/bin/env python3
# 部署 pm-workbench 云端函数到腾讯云 SCF（每日编排 + 巡逻自愈）
# 用法: python3 cloud/deploy_scf.py
# 依赖环境变量(从 shell 传入，不硬编码):
#   TENCENT_SECRET_ID, TENCENT_SECRET_KEY  (CAM 密钥)
#   ZHIPU_API_KEY, EDGEONE_TOKEN, GITEE_TOKEN
#   FUNCTION_ZIP  (可选，默认 ../scf_bundle.zip)
import os, sys, base64, zipfile, io

REGION = "ap-guangzhou"
NS = "default"
FUNC = "pm-workbench-daily"
HANDLER = "scf_handler.main_handler"
RUNTIME = "Nodejs18.15"
TIMEOUT = 900
MEMORY = 1024
# 云端函数执行角色：SCF 默认服务角色（CAM 已创建），必须用裸角色名（全 ARN 格式会被拒）
ROLE_ARN = "SCF_QcsRole"

from tencentcloud.common import credential
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile
from tencentcloud.scf.v20180416 import scf_client, models

def client():
    cred = credential.Credential(os.environ["TENCENT_SECRET_ID"], os.environ["TENCENT_SECRET_KEY"])
    hp = HttpProfile(); hp.reqTimeout = 60
    cp = ClientProfile(); cp.httpProfile = hp
    return scf_client.ScfClient(cred, REGION, cp)

def zip_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def env_map():
    return {
        "CLOUD": "1",
        "ZHIPU_API_KEY": os.environ.get("ZHIPU_API_KEY",""),
        "EDGEONE_TOKEN": os.environ.get("EDGEONE_TOKEN",""),
        "GITEE_TOKEN": os.environ.get("GITEE_TOKEN",""),
        "GITEE_OWNER": "ichi0623",
        "GITEE_REPO": "pm-workbench",
    }

def exists(cli):
    try:
        req = models.GetFunctionRequest()
        req.FunctionName = FUNC
        req.Namespace = NS
        cli.GetFunction(req)
        return True
    except Exception:
        return False

def main():
    zpath = os.environ.get("FUNCTION_ZIP", os.path.join(os.path.dirname(__file__), "..", "scf_bundle.zip"))
    b64 = zip_b64(zpath)
    cli = client()
    env = env_map()
    code = models.Code()
    code.ZipFile = b64

    if not exists(cli):
        print("[deploy] 创建函数", FUNC)
        req = models.CreateFunctionRequest()
        req.FunctionName = FUNC
        req.Namespace = NS
        req.Runtime = RUNTIME
        req.Handler = HANDLER
        req.Role = ROLE_ARN
        req.Code = code
        req.Timeout = TIMEOUT
        req.MemorySize = MEMORY
        req.Environment = models.Environment()
        req.Environment._deserialize({"Variables": [{"Key":k,"Value":v} for k,v in env.items()]})
        req.Description = "pm-workbench 云端每日更新+巡逻"
        cli.CreateFunction(req)
        print("[deploy] 创建完成，等待就绪...")
        import time; time.sleep(8)
        create_triggers(cli)
    else:
        print("[deploy] 函数已存在，更新代码+配置")
        up = models.UpdateFunctionCodeRequest()
        up.FunctionName = FUNC; up.Namespace = NS; up.Code = code
        cli.UpdateFunctionCode(up)
        cf = models.UpdateFunctionConfigurationRequest()
        cf.FunctionName = FUNC; cf.Namespace = NS; cf.Timeout = TIMEOUT; cf.MemorySize = MEMORY
        cf.Environment = models.Environment()
        cf.Environment._deserialize({"Variables": [{"Key":k,"Value":v} for k,v in env.items()]})
        cli.UpdateFunctionConfiguration(cf)
        print("[deploy] 代码+配置已更新")

    print("[deploy] DONE")

def create_triggers(cli):
    # 每日 07:10（TriggerDesc 为裸 7 段 cron 字符串，勿用 JSON 包裹）
    t1 = models.CreateTriggerRequest()
    t1.FunctionName = FUNC; t1.Namespace = NS; t1.Type = "timer"
    t1.TriggerName = "daily-0710"
    t1.TriggerDesc = "0 10 7 * * * *"
    t1.Enable = "OPEN"
    try: cli.CreateTrigger(t1); print("[trigger] daily 已建")
    except Exception as e: print("[trigger] daily 跳过:", e)
    # 每 6 小时巡逻
    t2 = models.CreateTriggerRequest()
    t2.FunctionName = FUNC; t2.Namespace = NS; t2.Type = "timer"
    t2.TriggerName = "patrol-6h"
    t2.TriggerDesc = "0 0 */6 * * * *"
    t2.Enable = "OPEN"
    try: cli.CreateTrigger(t2); print("[trigger] patrol 已建")
    except Exception as e: print("[trigger] patrol 跳过:", e)

if __name__ == "__main__":
    main()
