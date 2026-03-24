# LoveClaw - 八字缘分匹配

智能八字匹配技能，寻找有缘人

## 功能概述

- 🤖 **智能引导**：对话式收集用户信息
- 🔮 **八字计算**：根据出生日期时间自动计算八字
- 💕 **缘分匹配**：基于五行相生相克匹配用户
- 📱 **隐私保护**：手机号仅匹配成功后展示
- ⏰ **每日报告**：每晚8点推送匹配结果

## 安装

```bash
openclaw skills install bazi-match
```

或从源码安装：

```bash
cp -r ~/.openclaw/skills/bazi-match ~/.openclaw/workspace/skills/
```

## 配置定时任务

在 OpenClaw 中添加两个 cron 任务：

### 1. 每日零点 - 重置匹配状态并执行匹配

```json
{
  "name": "八字匹配-每日匹配",
  "schedule": {
    "kind": "cron",
    "expr": "0 0 * * *",
    "tz": "Asia/Shanghai"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "执行每日八字匹配任务，运行 ~/.openclaw/skills/bazi-match/scripts/cron.js match"
  },
  "sessionTarget": "isolated"
}
```

### 2. 每日晚8点 - 发送匹配报告

```json
{
  "name": "八字匹配-晚间报告",
  "schedule": {
    "kind": "cron",
    "expr": "0 20 * * *",
    "tz": "Asia/Shanghai"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "执行每日八字匹配报告，运行 ~/.openclaw/skills/bazi-match/scripts/cron.js report"
  },
  "sessionTarget": "isolated"
}
```

## 使用命令

| 命令 | 功能 |
|------|------|
| `开启匹配` / `报名` | 开始报名流程 |
| `开始报名` | 正式填写信息 |
| `我的档案` | 查看报名信息 |
| `今日匹配` | 查看今日匹配结果 |
| `取消报名` | 删除个人数据 |
| `修改` | 重新填写信息 |
| `确认` | 确认报名信息 |

## 数据存储

- 用户档案：`~/.openclaw/workspace/bazi-match/data/profiles.json`
- 匹配记录：`~/.openclaw/workspace/bazi-match/data/matches.json`
- 用户照片：`~/.openclaw/workspace/bazi-match/data/photos/`

## 八字匹配算法

### 五行权重

| 柱 | 权重 | 说明 |
|---|------|------|
| 年柱 | 20% | 祖辈缘分 |
| 月柱 | 25% | 父母缘分 |
| 日柱 | 30% | 核心匹配（最重要） |
| 时柱 | 25% | 晚运缘分 |

### 匹配规则

- 五行相生：100%
- 五行比和：80%
- 五行相克：50%

匹配阈值：≥ 70% 视为匹配成功

## 目录结构

```
bazi-match/
├── SKILL.md          # 技能定义
├── README.md         # 说明文档
├── scripts/
│   ├── bazi.js       # 八字计算
│   ├── data.js       # 数据管理
│   ├── match.js      # 匹配引擎
│   ├── handler.js    # 会话处理
│   └── cron.js       # 定时任务
└── data/             # 数据存储（运行时创建）
    ├── profiles.json
    ├── matches.json
    └── photos/
```

## 隐私说明

1. 手机号仅匹配成功后对匹配对象可见
2. 照片存储在本地，不会上传到任何服务器
3. 用户可随时输入「取消报名」删除所有数据
4. 匹配记录超过30天自动清理
