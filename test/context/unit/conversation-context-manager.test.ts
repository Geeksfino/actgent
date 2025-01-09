import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ConversationContextManager } from '../../../src/core/context/ConversationContextManager';
import { WorkingMemory } from '../../../src/core/memory/WorkingMemory';
import { NLPService } from '../../../src/core/memory/semantic/nlp/NLPService';
import { ConversationMessage, UserGoal, DomainContext, InteractionFlowType } from '../../../src/core/context/types';
import { MockHistoryManager } from '../utils/test-helpers';
import { MockMemoryStorage, MockMemoryIndex } from '../../memory/utils/test-helpers';
import { createTestMessage } from '../utils/test-helpers';

describe('ConversationContextManager', () => {
    let contextManager: ConversationContextManager;
    let workingMemory: WorkingMemory;
    let nlpService: NLPService;
    let mockHistoryManager: MockHistoryManager;
    let storage: MockMemoryStorage;
    let index: MockMemoryIndex;

    beforeEach(() => {
        storage = new MockMemoryStorage();
        index = new MockMemoryIndex();
        workingMemory = new WorkingMemory(storage, index);
        nlpService = {
            extractConcepts: vi.fn().mockResolvedValue({ concepts: [] }),
            calculateSimilarity: vi.fn().mockResolvedValue(0.5),
            classifyRelation: vi.fn()
        } as any;
        contextManager = new ConversationContextManager(workingMemory, nlpService);
        mockHistoryManager = new MockHistoryManager();
    });

    describe('Basic Context Operations', () => {
        test('should set and get context values', () => {
            contextManager.setContext('key1', 'value1');
            contextManager.setContext('key2', 'value2');

            expect(contextManager.getContextValue('key1')).toBe('value1');
            expect(contextManager.getContextValue('key2')).toBe('value2');
        });

        test('should clear context', () => {
            contextManager.setContext('key1', 'value1');
            contextManager.clearContext();

            expect(contextManager.getContextValue('key1')).toBeUndefined();
        });

        test('should handle undefined context keys', () => {
            expect(contextManager.getContextValue('nonexistent')).toBeUndefined();
        });
    });

    describe('Message Handling', () => {
        test('should add messages to history', async () => {
            const message = createTestMessage('test message');
            contextManager.addMessage(message);

            const context = await contextManager.getContext();
            expect(context.get('history')).toContain('test message');
        });

        test('should handle multiple messages', async () => {
            const messages = [
                createTestMessage('message 1'),
                createTestMessage('message 2', 'assistant'),
                createTestMessage('message 3')
            ];

            for (const message of messages) {
                contextManager.addMessage(message);
            }

            const context = await contextManager.getContext();
            const history = context.get('history');
            expect(history).toContain('message 1');
            expect(history).toContain('message 2');
            expect(history).toContain('message 3');
        });
    });

    describe('Context Integration', () => {
        test('should combine explicit context with history', async () => {
            contextManager.setContext('customKey', 'customValue');
            contextManager.addMessage(createTestMessage('test message'));

            const context = await contextManager.getContext();
            expect(context.get('customKey')).toBe('customValue');
            expect(context.get('history')).toContain('test message');
        });

        test('should maintain context after optimization', async () => {
            contextManager.setContext('persistentKey', 'persistentValue');
            contextManager.addMessage(createTestMessage('old message'));
            
            await contextManager.optimize();
            
            const context = await contextManager.getContext();
            expect(context.get('persistentKey')).toBe('persistentValue');
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid messages gracefully', () => {
            const invalidMessage = { ...createTestMessage('test'), content: undefined };
            expect(() => contextManager.addMessage(invalidMessage as any)).not.toThrow();
        });

        test('should handle context operations with invalid values', () => {
            expect(() => contextManager.setContext('key', undefined)).not.toThrow();
            expect(() => contextManager.setContext(undefined as any, 'value')).not.toThrow();
        });
    });

    describe('Goal Management', () => {
        test('should add and retrieve user goals', async () => {
            const goalData = {
                description: 'Build REST API',
                priority: 2,
                status: 'active' as const,
                metadata: { domain: 'backend' }
            };

            const goalId = contextManager.addUserGoal(goalData);
            const activeGoals = contextManager.getActiveGoals();

            expect(activeGoals).toHaveLength(1);
            expect(activeGoals[0].id).toBe(goalId);
            expect(activeGoals[0].description).toBe(goalData.description);
            expect(activeGoals[0].priority).toBe(goalData.priority);
        });

        test('should update existing goals', () => {
            const goalId = contextManager.addUserGoal({
                description: 'Original goal',
                priority: 1
            });

            contextManager.updateUserGoal(goalId, {
                description: 'Updated goal',
                priority: 2
            });

            const goal = contextManager.getActiveGoals()[0];
            expect(goal.description).toBe('Updated goal');
            expect(goal.priority).toBe(2);
        });

        test('should find relevant goals using NLP', async () => {
            // Setup mock NLP responses
            const mockConcepts = {
                concepts: [
                    { text: 'API', type: 'concept' },
                    { text: 'authentication', type: 'concept' }
                ]
            };
            (nlpService.extractConcepts as ReturnType<typeof vi.fn>).mockResolvedValue(mockConcepts);
            (nlpService.calculateSimilarity as ReturnType<typeof vi.fn>).mockResolvedValue(0.8);

            // Add test goals
            contextManager.addUserGoal({
                description: 'Build REST API with authentication',
                priority: 2
            });

            contextManager.addUserGoal({
                description: 'Design UI mockups',
                priority: 1
            });

            // Test message
            const message: ConversationMessage = {
                id: '1',
                content: 'Let\'s implement JWT authentication for the API',
                role: 'user',
                timestamp: new Date(),
                relevanceScore: 1,
                importance: 1,
                tokens: 10
            };

            await contextManager.addMessage(message);

            // Verify NLP service was called
            expect(nlpService.extractConcepts).toHaveBeenCalledWith(message.content);
            expect(nlpService.calculateSimilarity).toHaveBeenCalled();

            // Verify message metadata
            const context = await contextManager.getContext();
            const goals = context.get('goals') as UserGoal[];
            expect(goals[0].metadata?.lastSimilarityScore).toBeGreaterThan(0);
        });
    });

    describe('Domain Context Management', () => {
        test('should set and get domain context', () => {
            const domain: DomainContext = {
                domain: 'backend',
                confidence: 0.9,
                rules: new Map([['maxTokens', 1000]]),
                priority: 1,
                activeSince: new Date()
            };

            contextManager.setDomainContext(domain);
            const currentDomain = contextManager.getCurrentDomain();

            expect(currentDomain).toEqual(expect.objectContaining({
                domain: domain.domain,
                confidence: domain.confidence,
                priority: domain.priority
            }));
        });

        test('should decay domain confidence over time', async () => {
            const domain: DomainContext = {
                domain: 'backend',
                confidence: 1.0,
                rules: new Map(),
                priority: 1,
                activeSince: new Date(Date.now() - 3600000) // 1 hour ago
            };

            contextManager.setDomainContext(domain);
            await contextManager.optimize();
            const currentDomain = contextManager.getCurrentDomain();

            expect(currentDomain?.confidence).toBeLessThan(1.0);
        });

        test('should apply domain rules to messages', async () => {
            const domain: DomainContext = {
                domain: 'backend',
                confidence: 0.9,
                rules: new Map([['maxTokens', 1000]]),
                priority: 1,
                activeSince: new Date()
            };

            contextManager.setDomainContext(domain);

            const message: ConversationMessage = {
                id: '1',
                content: 'Test message',
                role: 'user',
                timestamp: new Date(),
                relevanceScore: 1,
                importance: 1,
                tokens: 10
            };

            await contextManager.addMessage(message);
            const context = await contextManager.getContext();
            
            expect(context.get('domain')).toEqual(expect.objectContaining({
                domain: domain.domain,
                confidence: domain.confidence
            }));
        });
    });

    describe('Interaction Flow', () => {
        test('should track message references', async () => {
            const message1: ConversationMessage = {
                id: '1',
                content: 'Original message',
                role: 'user',
                timestamp: new Date(),
                relevanceScore: 1,
                importance: 1,
                tokens: 10
            };

            const message2: ConversationMessage = {
                id: '2',
                content: 'Reply to original',
                role: 'assistant',
                timestamp: new Date(),
                relevanceScore: 1,
                importance: 1,
                tokens: 10,
                metadata: {
                    references: ['1']
                }
            };

            await contextManager.addMessage(message1);
            await contextManager.addMessage(message2);

            await contextManager.addInteractionFlow({
                messageId: message2.id,
                references: [message1.id],
                flow: InteractionFlowType.ANSWER,
                confidence: 1.0
            });

            const context = await contextManager.getContext();
            expect(context.get('history')).toContain(message1.content);
            expect(context.get('history')).toContain(message2.content);
        });
    });
});
