import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import { getDB } from '~/db';
import { getEdges, getSymbolDetails } from '~/db/query';
import { BUCKETS, vectorAdd, vectorNew } from '~/stats/vector';

interface Symbol {
  hash: string;
  fullName: string;
  origin: string;
  manifests: Record<string, Manifest>;
  delay: number[];
  latency: number[];
}

interface Manifest {
  hash: string;
  delay: number[];
  latency: number[];
}

export const useData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const [edges, details] = await Promise.all([
    getEdges(db, params.publicApiKey),
    getSymbolDetails(db, params.publicApiKey),
  ]);

  const symbolMap = new Map<string, Symbol>();
  const manifests = new Map<string, Manifest>();
  edges.forEach((edge) => {
    const manifest = getManifest(edge.manifestHash);
    const symbol = getSymbol(edge.to);
    const symbolManifest = getSymbolManifest(symbol, edge.manifestHash);
    vectorAdd(manifest.delay, edge.delay);
    vectorAdd(manifest.latency, edge.latency);
    vectorAdd(symbolManifest.delay, edge.delay);
    vectorAdd(symbolManifest.latency, edge.latency);
    vectorAdd(symbol.delay, edge.delay);
    vectorAdd(symbol.latency, edge.latency);
  });
  details.forEach((detail) => {
    const symbol = symbolMap.get(detail.hash);
    if (symbol) {
      symbol.fullName = detail.fullName;
      symbol.origin = detail.origin;
    }
  });
  return {
    symbols: Array.from(symbolMap.values()),
    manifests: Array.from(manifests.values()),
    buckets: BUCKETS,
  };
  ////////////////////////////////////////////////////////
  function getSymbol(name: string) {
    let symbol = symbolMap.get(name);
    if (!symbol) {
      symbol = {
        hash: name,
        fullName: '',
        origin: '',
        manifests: {} as Symbol['manifests'],
        delay: vectorNew(),
        latency: vectorNew(),
      };
      symbolMap.set(name, symbol);
    }
    return symbol;
  }

  function getSymbolManifest(symbol: Symbol, manifestHash: string) {
    let manifest = symbol.manifests[manifestHash] as undefined | Manifest;
    if (!manifest) {
      manifest = {
        hash: manifestHash,
        delay: vectorNew(),
        latency: vectorNew(),
      };
      symbol.manifests[manifestHash] = manifest;
    }
    return manifest;
  }

  function getManifest(manifestHash: string) {
    let manifest = manifests.get(manifestHash);
    if (!manifest) {
      manifest = {
        hash: manifestHash,
        delay: vectorNew(),
        latency: vectorNew(),
      };
      manifests.set(manifestHash, manifest);
    }
    return manifest;
  }
});

export default component$(() => {
  const data = useData();
  return (
    <div>
      <h1>Manifests</h1>
      <ul>
        {data.value.manifests.map((manifest, idx) => (
          <li key={idx}>
            <code>{manifest.hash}</code>
            <Histogram
              vector={manifest.delay}
              name="Delay"
              colors={delayColors}
              buckets={data.value.buckets}
            />
            <Histogram
              vector={manifest.latency}
              name="Latency"
              colors={latencyColors}
              buckets={data.value.buckets}
            />
          </li>
        ))}
      </ul>
      <h1>Symbols</h1>
      <ul>
        {data.value.symbols.map((symbol) => (
          <li key={symbol.hash}>
            <code>{symbol.hash}</code>(
            <code>
              {symbol.origin}/{symbol.fullName}
            </code>
            )
            <Histogram
              vector={symbol.delay}
              name="Delay"
              buckets={data.value.buckets}
              colors={delayColors}
            />
            <Histogram
              vector={symbol.latency}
              name="Latency"
              colors={latencyColors}
              buckets={data.value.buckets}
            />
          </li>
        ))}
      </ul>
    </div>
  );
});
