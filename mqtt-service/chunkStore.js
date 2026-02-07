const CHUNK_TTL_MS = 30 * 60 * 1000;

export function makeChunkKey(deviceMac, imageName, chunkIndex) {
  return `${deviceMac}|${imageName}|${chunkIndex}`;
}

export async function storeChunk(supabase, deviceMac, imageName, chunkIndex, chunkData) {
  const key = makeChunkKey(deviceMac, imageName, chunkIndex);
  try {
    const { data } = await supabase
      .from('edge_chunk_buffer')
      .upsert({
        chunk_key: key,
        device_mac: deviceMac,
        image_name: imageName,
        chunk_index: chunkIndex,
        chunk_data: Array.from(chunkData),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + CHUNK_TTL_MS).toISOString(),
      }, {
        onConflict: 'chunk_key',
        ignoreDuplicates: true,
      })
      .select('chunk_key')
      .maybeSingle();

    return !!data;
  } catch (err) {
    console.error('[ChunkStore] Error storing chunk:', err);
    return false;
  }
}

export async function isComplete(supabase, deviceMac, imageName, totalChunks) {
  const { count, error } = await supabase
    .from('edge_chunk_buffer')
    .select('*', { count: 'exact', head: true })
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);

  if (error) {
    console.error('[ChunkStore] Error checking completion:', error);
    return false;
  }

  return (count || 0) >= totalChunks;
}

export async function getMissingChunks(supabase, deviceMac, imageName, totalChunks) {
  const { data, error } = await supabase
    .from('edge_chunk_buffer')
    .select('chunk_index')
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);

  if (error) {
    console.error('[ChunkStore] Error fetching chunks:', error);
    return [];
  }

  const receivedIndices = new Set((data || []).map(r => r.chunk_index));
  const missing = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!receivedIndices.has(i)) {
      missing.push(i);
    }
  }
  return missing;
}

export async function assembleImageFromPostgres(supabase, deviceMac, imageName, totalChunks) {
  const { data, error } = await supabase
    .from('edge_chunk_buffer')
    .select('chunk_index, chunk_data')
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName)
    .order('chunk_index', { ascending: true });

  if (error || !data || data.length !== totalChunks) {
    console.error('[ChunkStore] Error assembling image:', error || `Expected ${totalChunks} chunks, got ${data?.length || 0}`);
    return null;
  }

  const chunks = data.map(row => new Uint8Array(row.chunk_data));
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(`[ChunkStore] Assembled image: ${imageName} (${totalLength} bytes from ${totalChunks} chunks)`);
  return merged;
}

export async function clearChunkBuffer(supabase, deviceMac, imageName) {
  const { error } = await supabase
    .from('edge_chunk_buffer')
    .delete()
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);

  if (error) {
    console.error('[ChunkStore] Error clearing buffer:', error);
  }
}

export async function cleanupStaleBuffers(supabase) {
  const { data, error } = await supabase
    .from('edge_chunk_buffer')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('chunk_key');

  if (error) return 0;
  return (data || []).length;
}

export async function getReceivedChunkCount(supabase, deviceMac, imageName) {
  const { count, error } = await supabase
    .from('edge_chunk_buffer')
    .select('*', { count: 'exact', head: true })
    .eq('device_mac', deviceMac)
    .eq('image_name', imageName);

  if (error) return 0;
  return count || 0;
}
