# Interview Repair Trainer

## 项目定位

Interview Repair Trainer 面向 Science and Engineering Undergraduates，用于搭建项目与科研经历深挖面试的临场修复训练体验。

## 技术栈

- Next.js（App Router 与 Route Handlers）
- React
- TypeScript
- Tailwind CSS
- Vitest
- Docker

## 架构概览

项目按四层拆分：

- Persona：`protocols/personas/`，定义面试官表达风格。
- Core Interview Protocol：`protocols/core/`，定义可复用的面试行为规则。
- Scenario Pack：`protocols/scenarios/`，承载具体面试场景。
- Runtime Engine：`src/domain/`、`src/server/` 与 `src/services/`，作为未来状态机、checkpoint、gate、repair 和 metrics 的运行边界。

`protocols/exports/` 预留给协议导出产物。第一阶段只建立工程与架构边界，尚未接入 LLM、STT 或面试修复业务逻辑。

## 本地启动

需要 Node.js 20.9 或更高版本。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。健康检查地址为 `http://localhost:3000/api/healthz`。

```bash
npm test
npm run build
```
