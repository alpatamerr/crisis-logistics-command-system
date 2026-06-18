# from pyspark.sql import functions as F
from transforms.api import transform_df, Input, Output


@transform_df(
    Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor"),
    source_df=Input("SOURCE_DATASET_PATH"),
)
def compute(source_df):
    return source_df
