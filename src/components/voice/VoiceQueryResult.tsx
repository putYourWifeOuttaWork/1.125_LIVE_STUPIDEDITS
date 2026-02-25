import { QueryResult } from '../../services/voiceService';
import { Search } from 'lucide-react';

interface VoiceQueryResultProps {
  result: QueryResult;
}

export function VoiceQueryResult({ result }: VoiceQueryResultProps) {
  return (
    <div className="border border-secondary-200 rounded-lg p-3 bg-secondary-50">
      <div className="flex items-center gap-2 mb-2">
        <Search size={14} className="text-secondary-600" />
        <span className="text-xs font-medium text-secondary-700 uppercase tracking-wide">
          {result.query_type?.replace(/_/g, ' ') || 'Query Result'}
        </span>
      </div>
      <p className="text-sm text-gray-800">{result.summary}</p>
    </div>
  );
}
