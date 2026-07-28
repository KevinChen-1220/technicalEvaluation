import type { AssessmentPaper } from './types';

const levels = [
  {
    minPercent: 0,
    maxPercent: 59,
    title: '需要加强',
    summary: '核心概念仍需巩固，建议复习后再尝试独立完成相关工作。',
  },
  {
    minPercent: 60,
    maxPercent: 79,
    title: '熟练掌握',
    summary: '你已经掌握主要概念，接下来可以重点补强薄弱知识点。',
  },
  {
    minPercent: 80,
    maxPercent: 100,
    title: '进阶水平',
    summary: '你对相关知识掌握扎实，能够处理较复杂的实际场景。',
  },
];

export const samplePaper = {
  id: 'sample-ios-paper',
  topic: 'iOS 开发能力',
  questionCount: 50,
  generatedAt: '2026-07-09T00:00:00.000Z',
  scoring: { maxScore: 4, levels },
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      difficulty: 'easy',
      knowledgePoint: '内存管理',
      prompt: '在闭包捕获列表中，哪个 Swift 关键字可以避免引用循环？',
      options: [
        { id: 'A', text: 'strong（强引用）' },
        { id: 'B', text: 'weak（弱引用）' },
        { id: 'C', text: 'copy（复制）' },
        { id: 'D', text: 'atomic（原子）' },
      ],
      correctOptionIds: ['B'],
      explanation: '`weak` 不会增加引用计数；当被捕获对象允许变为 nil 时，它可以避免形成循环引用。',
    },
    {
      id: 'q2',
      type: 'true_false',
      difficulty: 'medium',
      knowledgePoint: '并发编程',
      prompt: 'UIKit 和 SwiftUI 的界面更新应该在主线程执行。',
      options: [
        { id: 'A', text: '正确' },
        { id: 'B', text: '错误' },
      ],
      correctOptionIds: ['A'],
      explanation: 'Apple 的界面框架与主线程绑定，因此界面状态变更应调度到主执行器或主队列。',
    },
    {
      id: 'q3',
      type: 'single_choice',
      difficulty: 'medium',
      knowledgePoint: '应用架构',
      prompt: '将视图模型与视图分离的主要目的是什么？',
      options: [
        { id: 'A', text: '让展示逻辑可测试，并减少视图承担的职责' },
        { id: 'B', text: '强制每个页面都发起网络请求' },
        { id: 'C', text: '禁止状态更新' },
        { id: 'D', text: '替换所有模型对象' },
      ],
      correctOptionIds: ['A'],
      explanation: '视图模型为视图准备展示状态和操作，使视图代码更精简，也更容易测试。',
    },
    {
      id: 'q4',
      type: 'multiple_choice',
      difficulty: 'hard',
      knowledgePoint: '并发编程',
      prompt: '哪些技术可以提升 Swift 并发代码的安全性？',
      options: [
        { id: 'A', text: 'Actor 隔离' },
        { id: 'B', text: '结构化并发' },
        { id: 'C', text: '使用 MainActor 管理界面相关状态' },
        { id: 'D', text: '从任意队列修改共享状态' },
      ],
      correctOptionIds: ['A', 'B', 'C'],
      explanation: 'Actor、结构化并发和主执行器隔离能够减少数据竞争，并让状态所有权更加清晰。',
    },
  ],
} satisfies AssessmentPaper;
