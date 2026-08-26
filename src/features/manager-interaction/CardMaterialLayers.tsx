type CardMaterialLayersProps = {
  edgeUrl: string;
} & (
  | {
      finish: 'framed';
    }
  | {
      finish: 'holographic';
      sparklesUrl: string;
      showSparkles: boolean;
    }
);

export function CardMaterialLayers(props: CardMaterialLayersProps) {
  return (
    <>
      {props.finish === 'holographic' && props.showSparkles && (
        <img
          className="card-material__sparkles"
          src={props.sparklesUrl}
          alt=""
        />
      )}
      <img className="card-material__edge" src={props.edgeUrl} alt="" />
      <span className="card-material__inset-frame" aria-hidden="true" />
    </>
  );
}
