import type { AssessmentPaper } from './types';

const levels = [
  {
    minPercent: 0,
    maxPercent: 59,
    title: 'Needs Practice',
    summary: 'Core concepts need more review before independent work.',
  },
  {
    minPercent: 60,
    maxPercent: 79,
    title: 'Proficient',
    summary: 'You understand the main ideas and should focus on weak knowledge points.',
  },
  {
    minPercent: 80,
    maxPercent: 100,
    title: 'Advanced',
    summary: 'You show strong command and can handle complex scenarios.',
  },
];

export const samplePaper = {
  id: 'sample-ios-paper',
  topic: 'iOS Development',
  questionCount: 50,
  generatedAt: '2026-07-09T00:00:00.000Z',
  scoring: { maxScore: 4, levels },
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      difficulty: 'easy',
      knowledgePoint: 'Memory',
      prompt: 'Which Swift keyword prevents a reference cycle in a closure capture list?',
      options: [
        { id: 'A', text: 'strong' },
        { id: 'B', text: 'weak' },
        { id: 'C', text: 'copy' },
        { id: 'D', text: 'atomic' },
      ],
      correctOptionIds: ['B'],
      explanation: '`weak` avoids increasing the reference count and prevents retain cycles when the captured object can become nil.',
    },
    {
      id: 'q2',
      type: 'true_false',
      difficulty: 'medium',
      knowledgePoint: 'Concurrency',
      prompt: 'UI updates in UIKit and SwiftUI should be performed on the main thread.',
      options: [
        { id: 'A', text: 'True' },
        { id: 'B', text: 'False' },
      ],
      correctOptionIds: ['A'],
      explanation: 'Apple UI frameworks are main-thread-bound, so UI mutations should be dispatched to the main actor or main queue.',
    },
    {
      id: 'q3',
      type: 'single_choice',
      difficulty: 'medium',
      knowledgePoint: 'Architecture',
      prompt: 'What is the main purpose of separating view models from views?',
      options: [
        { id: 'A', text: 'Keep presentation logic testable and reduce view responsibilities' },
        { id: 'B', text: 'Force every screen to use network requests' },
        { id: 'C', text: 'Disable state updates' },
        { id: 'D', text: 'Replace all model objects' },
      ],
      correctOptionIds: ['A'],
      explanation: 'A view model prepares display state and actions for the view, which keeps view code smaller and easier to test.',
    },
    {
      id: 'q4',
      type: 'multiple_choice',
      difficulty: 'hard',
      knowledgePoint: 'Concurrency',
      prompt: 'Which techniques can help make concurrent code safer in Swift?',
      options: [
        { id: 'A', text: 'Actor isolation' },
        { id: 'B', text: 'Structured concurrency' },
        { id: 'C', text: 'MainActor for UI-bound state' },
        { id: 'D', text: 'Mutating shared state from arbitrary queues' },
      ],
      correctOptionIds: ['A', 'B', 'C'],
      explanation: 'Actors, structured concurrency, and main-actor isolation reduce data races and make ownership clearer.',
    },
  ],
} satisfies AssessmentPaper;
