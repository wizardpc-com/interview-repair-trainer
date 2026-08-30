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

`protocols/exports/` 预留给协议导出产物。当前代码包含工程骨架和 Stage 1 domain contracts，尚未接入 LLM、STT 或面试修复业务逻辑。

下一阶段按 text-first 纵向切片开发：一个 provider-independent LLM service 复用一个实际模型，QuestionPlan 在服务端预先冻结，应用层 Gate Arbiter 控制状态转换，Session 使用单实例内存存储与 TTL。Browser STT、持久化和双模型优化均延后。

详细约束见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，执行顺序见 [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)。

## 本地启动

推荐使用与 Docker 一致的 Node.js 24；最低支持版本为 Node.js 20.9。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。健康检查地址为 `http://localhost:3000/api/healthz`。

```bash
npm test
npm run build
```
