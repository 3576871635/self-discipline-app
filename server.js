const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makePlan(input) {
  const title = String(input.title || '').trim();
  const deadline = String(input.deadline || '');
  const dailyMinutes = Number(input.dailyMinutes);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 720) {
    return { error: 'INVALID_INPUT', message: 'title、deadline 和 dailyMinutes 必须有效。' };
  }

  const end = new Date(`${deadline}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const start = end >= tomorrow ? tomorrow : today;
  const days = Math.max(1, Math.min(14, Math.floor((end - start) / 86400000) + 1));
  const genericStages = [
    ['确定学习范围', '明确核心概念与学习边界', '列出一个可验证的小练习'],
    ['学习核心概念', '理解关键概念和常见误区', '用一个小例子验证理解'],
    ['完成项目实操', '说明本阶段要解决的问题', '完成一个可运行的小成果'],
    ['复习与自测', '整理自己的知识卡片', '独立完成一次小测或改进']
  ];
  const cppStages = [
    ['程序结构与编译运行', '理解源文件、main 函数、编译器和基本输入输出', '编写并运行一个输出信息和计算结果的程序'],
    ['变量、类型与表达式', '理解基本数据类型、变量、常量和类型转换', '编写一个平均分或温度转换程序'],
    ['条件判断与逻辑', '理解 if、else、switch 和逻辑运算', '编写一个根据成绩或菜单选项给出结果的程序'],
    ['循环与重复处理', '理解 for、while 和循环条件', '编写一个累加、统计数字或乘法表程序'],
    ['函数与模块化', '理解参数、返回值、作用域和函数拆分', '把前面的程序改造成多个函数'],
    ['数组、字符串与容器', '理解数组、字符串和基本容器；vector 深入程度需要确认', '读取多个数据并计算最大值、最小值和平均值'],
    ['指针、引用与结构体', '理解引用、指针和结构体的基础概念', '用结构体保存一个学习任务并编写函数修改它'],
    ['综合实操与复习', '复习变量、条件、循环、函数和数据结构', '完成一个简单的命令行学习任务管理器']
  ];
  const aiStages = [
    ['AI 工作流与角色', '理解用户、前端、后端和 AI 模型在一个工作流中的职责', '画出“用户输入 -> AI 生成 -> 校验 -> 人工确认”的调用链'],
    ['提示词与约束', '理解目标、上下文、角色、输出格式和约束如何影响 AI 结果', '为学习计划助手写一份包含输入和约束的提示词'],
    ['结构化输出 JSON', '理解为什么程序需要稳定字段，而不是直接使用自然语言答案', '设计包含 title、plannedDate、estimatedMinutes、concept、practice 的 JSON'],
    ['AI 结果验收', '理解日期、时间预算、前置知识和资料链接等规则检查', '写出一份 AI 学习计划检查清单并找出一个问题'],
    ['前端、后端与 API', '理解浏览器、自己的后端和 AI API 之间的数据流', '用文字描述一次 POST /api/plan 请求和响应'],
    ['密钥与安全边界', '理解 API Key 为什么只能放在服务端，以及输入和输出为什么都要校验', '列出至少 5 条安全或错误处理规则'],
    ['Mock 接口实操', '理解 Mock API 如何模拟真实 AI，先验证接口契约和用户确认流程', '在当前应用中生成、编辑并确认一份 AI 学习计划'],
    ['综合项目与复盘', '复习提示词、JSON、校验、接口和人工确认的完整流程', '完成一份“AI 基本工作流”计划并写下下一步真实 AI 接入需求']
  ];
  const stages = /c\+\+/i.test(title) ? cppStages : /\bai\b|人工智能|提示词|大模型/i.test(title) ? aiStages : genericStages;

  return {
    goal: title,
    source: 'mock-api',
    stages: Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const template = stages[index % stages.length];
      return {
        title: days > stages.length ? `${template[0]}（第 ${index + 1} 天）` : template[0],
        plannedDate: dateKey(date),
        estimatedMinutes: dailyMinutes,
        concept: template[1],
        practice: template[2],
        resources: []
      };
    })
  };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 100000) reject(new Error('payload too large')); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('invalid json')); } });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true, mode: 'mock-api' });
    if (request.method === 'POST' && request.url === '/api/plan') {
      const result = makePlan(await readJson(request));
      return result.error ? send(response, 400, result) : send(response, 200, result);
    }
    if (request.method === 'GET' && (request.url === '/' || request.url === '/index.html')) {
      return send(response, 200, fs.readFileSync(path.join(ROOT, 'index.html')), 'text/html; charset=utf-8');
    }
    send(response, 404, { error: 'NOT_FOUND', message: '没有找到这个地址。' });
  } catch (error) {
    send(response, 500, { error: 'SERVER_ERROR', message: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`ik自律助手正在监听端口 ${PORT}`));
