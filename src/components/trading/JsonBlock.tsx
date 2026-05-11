type JsonBlockProps = {
  value: unknown;
};

export default function JsonBlock(props: JsonBlockProps) {
  return (
    <pre class="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-xs leading-6 text-slate-200">
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}
