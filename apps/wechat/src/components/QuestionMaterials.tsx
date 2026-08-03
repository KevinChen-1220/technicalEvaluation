import { useState } from 'react';
import { Image, ScrollView, Text, View } from '@tarojs/components';
import type {
  QuestionBarChartMaterial,
  QuestionImageMaterial,
  QuestionMaterial,
  QuestionTableMaterial,
} from '@dynamic-assessment/assessment-core';
import { calculateBarWidths, getTableMinWidth } from './materialLayout';

export function QuestionMaterials({ materials = [] }: { materials?: QuestionMaterial[] | undefined }) {
  if (materials.length === 0) return null;
  return (
    <View className='question-materials'>
      {materials.map((material, index) => (
        <Material key={`${material.type}-${index}`} material={material} />
      ))}
    </View>
  );
}

function Material({ material }: { material: QuestionMaterial }) {
  switch (material.type) {
    case 'text':
      return <Text className='material-text'>{material.text}</Text>;
    case 'image':
      return <ImageMaterial material={material} />;
    case 'table':
      return <TableMaterial material={material} />;
    case 'bar_chart':
      return <BarChartMaterial material={material} />;
  }
}

function ImageMaterial({ material }: { material: QuestionImageMaterial }) {
  const [failed, setFailed] = useState(false);
  const ratio = material.aspectRatio ?? 16 / 9;
  return (
    <View className='material-block'>
      {failed ? (
        <View className='material-image-fallback'><Text>{material.alt}</Text></View>
      ) : (
        <Image
          className='material-image'
          src={material.uri}
          mode='aspectFit'
          style={{ aspectRatio: ratio }}
          onError={() => setFailed(true)}
        />
      )}
      {material.caption ? <Text className='material-caption'>{material.caption}</Text> : null}
    </View>
  );
}

function TableMaterial({ material }: { material: QuestionTableMaterial }) {
  const minWidth = getTableMinWidth(material.columns.length);
  return (
    <View className='material-block'>
      {material.caption ? <Text className='material-caption material-caption--heading'>{material.caption}</Text> : null}
      <ScrollView className='material-table-scroll' scrollX enhanced>
        <View className='material-table' style={{ minWidth }}>
          <View className='material-table__row material-table__row--header'>
            {material.columns.map((column, index) => <Text key={`${column}-${index}`} className='material-table__cell'>{column}</Text>)}
          </View>
          {material.rows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} className='material-table__row'>
              {row.map((cell, cellIndex) => <Text key={`cell-${cellIndex}`} className='material-table__cell'>{cell}</Text>)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function BarChartMaterial({ material }: { material: QuestionBarChartMaterial }) {
  const widths = calculateBarWidths(material.items);
  return (
    <View className='material-block material-chart'>
      {material.title ? <Text className='material-caption material-caption--heading'>{material.title}</Text> : null}
      {material.items.map((item, index) => (
        <View key={`${item.label}-${index}`} className='material-chart__row'>
          <Text className='material-chart__label'>{item.label}</Text>
          <View className='material-chart__track'>
            <View className='material-chart__bar' style={{ width: `${widths[index] ?? 0}%` }} />
          </View>
          <Text className='material-chart__value'>{item.displayValue ?? `${item.value}${material.unit ?? ''}`}</Text>
        </View>
      ))}
    </View>
  );
}
