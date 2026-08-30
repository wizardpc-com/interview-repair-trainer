# Interview Repair Trainer

## 项目定位

Interview Repair Trainer 面向 Science and Engineering Undergraduates，用于搭建项目与科研经历深挖面试的临场修复训练体验。

## 技术栈

- Next.js（App Router 与 Route Handlers）
- React
- TypeScript
- Tailwind CSS
- Vitest
- Zod
- Docker

## 架构概览

项目按四层拆分：

- Persona：`protocols/personas/`，定义面试官表达风格。
- Core Interview Protocol：`protocols/core/`，定义可复用的面试行为规则。
- Scenario Pack：`protocols/scenarios/`，承载具体面试场景。
- Runtime Engine：`src/domain/`、`src/server/` 与 `src/services/`，作为未来状态机、checkpoint、gate、repair 和 metrics 的运行边界。

`protocols/exports/` 预留给协议导出产物。当前代码已完成 Stage 1–3，并提供 Stage 4 provider-independent LLM service、单一 Qwen adapter 及结构化输出校验；尚未实现 Hidden Session、完整 interview API/UI、STT 或 Repair runtime。

后续继续按 text-first 纵向切片开发：在单一 LLM service 边界之上，将 QuestionPlan 冻结到单实例内存 Session，再实现应用状态机和 Semantic Evaluator/Gate Arbiter 编排。Browser STT、持久化和双模型优化均延后。

详细约束见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，执行顺序见 [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)。

## 本地启动

推荐使用与 Docker 一致的 Node.js 24；最低支持版本为 Node.js 20.9。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。健康检查地址为 `http://localhost:3000/api/healthz`。

如需实际调用 Qwen，将 `.env.example` 复制为被 Git 忽略的 `.env.local`，并填写 `QWEN_API_KEY`。测试和构建不需要真实 key。

```bash
npm test
npm run build
```
