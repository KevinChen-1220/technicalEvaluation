import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { FixedBottomNavigation } from '../../components/FixedBottomNavigation';
import { getAssessmentOpenTarget, createHistoryController, type HistoryState } from '../../services/assessment-sync';
import { cloudClient } from '../../services/cloud';
import { createMiniProgramShellState } from '../../shell/viewModel';
import { assessmentCache, assessmentSyncQueue } from '../../storage/runtime';

export default function HistoryPage() {
  const shell = createMiniProgramShellState();
  const controllerRef = useRef<ReturnType<typeof createHistoryController>>();
  const [history, setHistory] = useState<HistoryState>({
    rows: [],
    records: [],
    status: 'idle',
    nextCursor: null,
  });

  if (controllerRef.current === undefined) {
    controllerRef.current = createHistoryController({
      cache: assessmentCache,
      listAssessments: async (input) => {
        const result = await cloudClient.listAssessments(input);
        return { assessments: result.assessments, nextCursor: result.nextCursor };
      },
      syncPendingUpdate: (update) => assessmentSyncQueue.resume(update.assessmentId),
    });
  }

  useEffect(() => {
    const controller = controllerRef.current!;
    setHistory(controller.loadCached());
    void controller.refreshFromCloud().then(setHistory);
  }, []);

  async function openAssessment(id: string): Promise<void> {
    const record = history.records.find((candidate) => candidate.id === id) ?? assessmentCache.getAssessment(id);
    if (record === undefined) return;
    assessmentCache.saveAssessment(record);
    const target = getAssessmentOpenTarget(record);
    if (target.route === 'result') {
      await Taro.navigateTo({ url: `/pages/result/index?assessmentId=${encodeURIComponent(target.assessmentId)}` });
      return;
    }
    await Taro.navigateTo({
      url: `/pages/answer/index?assessmentId=${encodeURIComponent(target.assessmentId)}&startIndex=${target.startIndex}`,
    });
  }

  async function loadMore(): Promise<void> {
    if (history.nextCursor === null) return;
    const next = await controllerRef.current!.refreshFromCloud(history.nextCursor);
    setHistory(next);
  }

  return (
    <View className='app-page'>
      <View className='page-header'>
        <Text className='page-title'>{shell.history.title}</Text>
        <Text className='page-subtitle'>查看已生成和完成的测评。</Text>
      </View>
      {history.status === 'refreshing' && history.rows.length === 0 ? (
        <View className='empty-state'><Text>正在读取历史...</Text></View>
      ) : null}
      {history.status === 'offline' && history.rows.length > 0 ? (
        <Text className='history-offline'>当前显示本地缓存，联网后会自动刷新。</Text>
      ) : null}
      {history.status === 'error' ? (
        <View className='empty-state'>
          <Text>历史暂时无法读取</Text>
          <Button className='inline-action' onClick={() => { void controllerRef.current!.refreshFromCloud().then(setHistory); }}>重试</Button>
        </View>
      ) : null}
      {history.rows.length === 0 && history.status !== 'refreshing' && history.status !== 'error' ? (
        <View className='empty-state'><Text>{shell.history.emptyMessage}</Text></View>
      ) : null}
      <View className='history-list'>
        {history.rows.map((row) => (
          <View
            key={row.id}
            className='history-row'
            hoverClass='history-row--pressed'
            onClick={() => { void openAssessment(row.id); }}
          >
            <View className='history-row__main'>
              <Text className='history-row__topic'>{row.topic}</Text>
              <Text className='history-row__meta'>{row.updatedLabel} · {row.progressLabel}</Text>
            </View>
            <View className='history-row__side'>
              <Text className={`history-status history-status--${row.status}`}>{row.statusLabel}</Text>
              {row.scoreLabel ? <Text className='history-score'>{row.scoreLabel}</Text> : null}
            </View>
          </View>
        ))}
      </View>
      {history.nextCursor !== null ? (
        <Button className='inline-action' onClick={() => { void loadMore(); }}>加载更多</Button>
      ) : null}
      <FixedBottomNavigation activeTab='history' />
    </View>
  );
}
