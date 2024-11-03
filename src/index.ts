interface Env {
    CHAPTER_QUEUE: Queue<any>;
    TASK_QUEUE_MANAGER: DurableObjectNamespace;
}

interface ChapterTask {
    subtask_id: string;
    key: string;
    task_id: string;
    start_chapter: string;
    end_chapter: string;
    total_chapters: number;
}

export class TaskQueueManager implements DurableObject {
    constructor(private state: DurableObjectState, private env: Env) {}

    async fetch(request: Request): Promise<Response> {
        try {
            if (request.method !== 'POST') {
                return new Response('Method not allowed', { 
                    status: 405,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 获取任务列表
            const tasks = await request.json() as ChapterTask[];
            if (!Array.isArray(tasks)) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid tasks data: expected an array'
                }), { 
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 记录初始数量
            const totalTasks = tasks.length;
            let successCount = 0;
            let failedCount = 0;

            // 批量处理任务
            try {
                // 准备批量消息
                const messages = tasks.map(task => ({
                    body: {  // 需要用 body 包裹消息内容
                        ...task,
                        queued_at: new Date().toISOString()
                    }
                }));
                
                // 使用 sendBatch 一次性发送所有消息
                await this.env.CHAPTER_QUEUE.sendBatch(messages);
                successCount = tasks.length;
            } catch (error) {
                failedCount = tasks.length;
                console.error(`Failed to queue batch:`, error);
            }

            // 返回简单的统计结果
            return new Response(JSON.stringify({
                success: true,
                total_tasks: totalTasks,
                success_count: successCount,
                failed_count: failedCount
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (err) {
            // 类型安全的错误处理
            const error = err as Error;
            return new Response(JSON.stringify({
                success: false,
                error: error.message,
                // 可以添加更多错误信息
                timestamp: new Date().toISOString()
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const id = env.TASK_QUEUE_MANAGER.idFromName('queue-manager');
        const taskManager = env.TASK_QUEUE_MANAGER.get(id);
        return taskManager.fetch(request);
    }
};