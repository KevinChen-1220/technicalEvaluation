import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type {
  QuestionBarChartMaterial,
  QuestionImageMaterial,
  QuestionMaterial,
  QuestionTableMaterial,
} from '../features/assessment/types';
import { theme } from '../theme';
import { getBarFillPercent, getImageAspectRatio } from './questionMaterialLayout';

export function QuestionMaterials({ materials }: { materials?: QuestionMaterial[] | undefined }) {
  if (!materials?.length) return null;

  return (
    <View style={styles.materials}>
      {materials.map((material, index) => {
        const key = `${material.type}-${index}`;

        switch (material.type) {
          case 'text':
            return <Text key={key} style={styles.bodyText}>{material.text}</Text>;
          case 'image':
            return <QuestionImage key={key} material={material} />;
          case 'table':
            return <QuestionTable key={key} material={material} />;
          case 'bar_chart':
            return <QuestionBarChart key={key} material={material} />;
        }
      })}
    </View>
  );
}

function QuestionImage({ material }: { material: QuestionImageMaterial }) {
  const [failed, setFailed] = useState(false);

  return (
    <View style={styles.figure}>
      {failed ? (
        <View
          accessibilityLabel={material.alt}
          accessibilityRole="image"
          style={[styles.imageFallback, { aspectRatio: getImageAspectRatio(material.aspectRatio) }]}
        >
          <Text style={styles.imageFallbackTitle}>图片暂时无法加载</Text>
          <Text style={styles.caption}>{material.alt}</Text>
        </View>
      ) : (
        <Image
          accessibilityLabel={material.alt}
          accessible
          onError={() => setFailed(true)}
          resizeMode="contain"
          source={{ uri: material.uri }}
          style={[styles.image, { aspectRatio: getImageAspectRatio(material.aspectRatio) }]}
        />
      )}
      {material.caption ? <Text style={styles.caption}>{material.caption}</Text> : null}
    </View>
  );
}

function QuestionTable({ material }: { material: QuestionTableMaterial }) {
  return (
    <View style={styles.figure}>
      {material.caption ? <Text style={styles.materialTitle}>{material.caption}</Text> : null}
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            {material.columns.map((column, index) => (
              <Text key={`${column}-${index}`} style={[styles.tableCell, styles.tableHeaderText]}>{column}</Text>
            ))}
          </View>
          {material.rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.tableRow}>
              {row.map((cell, cellIndex) => (
                <Text key={`cell-${rowIndex}-${cellIndex}`} style={styles.tableCell}>{cell}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function QuestionBarChart({ material }: { material: QuestionBarChartMaterial }) {
  const maximum = Math.max(0, ...material.items.map((item) => item.value));

  return (
    <View
      accessibilityLabel={material.title}
      accessibilityRole="image"
      style={styles.figure}
    >
      {material.title ? <Text style={styles.materialTitle}>{material.title}</Text> : null}
      <View style={styles.chart}>
        {material.items.map((item, index) => {
          const displayedValue = item.displayValue ?? `${item.value}${material.unit ? ` ${material.unit}` : ''}`;
          return (
            <View key={`${item.label}-${index}`} style={styles.chartItem}>
              <View style={styles.chartLabels}>
                <Text style={styles.chartLabel}>{item.label}</Text>
                <Text style={styles.chartValue}>{displayedValue}</Text>
              </View>
              <View style={styles.chartTrack}>
                <View style={[styles.chartFill, { width: getBarFillPercent(item.value, maximum) }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  materials: { gap: theme.spacing.md },
  bodyText: { color: theme.colors.ink, fontSize: 16, lineHeight: 25 },
  figure: { gap: theme.spacing.sm },
  materialTitle: { color: theme.colors.ink, fontSize: 15, fontWeight: '800', lineHeight: 22 },
  caption: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  image: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, width: '100%' },
  imageFallback: {
    alignItems: 'center',
    backgroundColor: theme.colors.canvas,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    width: '100%',
  },
  imageFallbackTitle: { color: theme.colors.ink, fontSize: 15, fontWeight: '800', marginBottom: theme.spacing.xs },
  table: { borderColor: theme.colors.border, borderLeftWidth: 1, borderTopWidth: 1 },
  tableRow: { flexDirection: 'row' },
  tableHeader: { backgroundColor: theme.colors.accentSoft },
  tableCell: {
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    borderRightWidth: 1,
    color: theme.colors.ink,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    width: 120,
  },
  tableHeaderText: { fontWeight: '800' },
  chart: { gap: theme.spacing.md },
  chartItem: { gap: theme.spacing.xs },
  chartLabels: { flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'space-between' },
  chartLabel: { color: theme.colors.ink, flex: 1, fontSize: 14, fontWeight: '700' },
  chartValue: { color: theme.colors.muted, fontSize: 14, fontWeight: '700' },
  chartTrack: { backgroundColor: theme.colors.border, borderRadius: theme.radius.pill, height: 10, overflow: 'hidden' },
  chartFill: { backgroundColor: theme.colors.blue, borderRadius: theme.radius.pill, height: '100%' },
});
