# LoveClaw - 八字缘分匹配

> 智能八字匹配技能，寻找有缘人 — 无需用户配置，直接使用

## Skill Configuration

```yaml
name: loveclaw
description: LoveClaw 八字缘分匹配，用户输入信息后自动匹配有缘人
handler: ./scripts/handler.js
triggerInputs:
  开启匹配:
    next: onboarding
  报名:
    next: onboarding
  加入匹配:
    next: onboarding
  我的档案:
    next: profile
  今日匹配:
    next: today_match
  详细匹配:
    next: detail_match
  取消报名:
    next: cancel
  修改:
    next: modify
  修改信息:
    next: modify
  确认:
    next: confirm
  保持:
    next: keep
  stats:
    next: stats
  1:
    next: option_1
  2:
    next: option_2
```

## 功能概述

- 🤖 **零配置**：用户直接输入信息，无需任何 API key 或账号
- 🔮 **八字计算**：根据出生日期时间自动计算八字
- 💕 **缘分匹配**：基于五行相生相克匹配用户
- 📱 **隐私保护**：手机号仅匹配成功后展示
- ⏰ **每日报告**：每晚8点推送匹配结果
- ☁️ **云端存储**：所有用户数据存储在共享阿里云

## 报名流程

用户发送「开启匹配」后，按顺序输入：
1. 姓名
2. 性别（男/女）
3. 希望匹配的性别
4. 手机号
5. 出生日期（YYYY-MM-DD）
6. 出生时辰（小时 0-23）
7. 居住城市
8. 一张照片

## 命令列表

| 命令 | 功能 |
|------|------|
| `开启匹配` / `报名` | 开始报名流程 |
| `开始报名` | 正式填写信息 |
| `我的档案` | 查看报名信息 |
| `今日匹配` | 查看今日匹配结果 |
| `详细匹配` | 查看完整匹配报告 |
| `取消报名` | 删除个人数据 |
| `修改` / `修改信息` | 重新填写信息 |
| `确认` | 确认报名信息 |
| `保持` | 保留现有信息 |

## 定时任务

- **每日匹配**：每天 19:50 执行
- **晚间报告**：每天 20:00 发送

## 数据存储

- 云端：**阿里云 TableStore + OSS**
  - 用户档案：TableStore
  - 照片存储：OSS `loveclaw/photos/` 目录
  - 照片 URL：永久有效
- 本地缓存：照片临时缓存在 `workspace/loveclaw/data/photos/`

## 文件结构

```
loveclaw/
├── SKILL.md              # 技能定义
├── README.md             # 说明文档
├── package.json          # 依赖配置
├── scripts/
│   ├── handler.js        # 会话处理
│   ├── cloud-handler.js  # 云端会话处理
│   ├── cloud-data.js     # 云端数据操作
│   ├── api-client.js     # API 客户端
│   ├── bazi.js           # 八字计算
│   ├── match.js          # 匹配引擎
│   └── cron.js           # 本地定时任务
```

## 匹配算法

**匹配条件（必须同时满足）：**
1. ✅ 双向匹配：A喜欢B，B也喜欢A（双向分数都≥70%）
2. ✅ 必须同城：双方必须在同一城市

**匹配分数：**
- 五行相生：100%
- 五行比和：80%
- 五行相克：50%
- 双向分数取最低值作为共同分数

**选择逻辑：**
1. 筛选同城 + 双向匹配的用户
2. 按共同分数从高到低排序
3. 每日只匹配1人（分数最高者）
4. 异地用户不参与匹配

**无匹配通知：**
- 如果当日没有同城双向匹配，8点发送：
  「命运的齿轮继续转动，请期待月老明日的光临 ✨」

---

*Made with ❤️ for finding your destiny*
