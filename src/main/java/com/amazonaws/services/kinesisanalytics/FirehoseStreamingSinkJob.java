package com.amazonaws.services.kinesisanalytics;

import com.amazonaws.services.kinesisanalytics.flink.connectors.producer.FlinkKinesisFirehoseProducer;
import org.apache.flink.connector.firehose.sink.KinesisFirehoseSinkBuilder;
import com.amazonaws.services.kinesisanalytics.runtime.KinesisAnalyticsRuntime;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.core.io.SimpleVersionedSerializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.sink.filesystem.BucketAssigner;
import org.apache.flink.streaming.api.functions.sink.filesystem.bucketassigners.SimpleVersionedStringSerializer;
import org.apache.flink.streaming.connectors.kinesis.FlinkKinesisConsumer;
import org.apache.flink.streaming.connectors.kinesis.config.ConsumerConfigConstants;
import org.apache.flink.streaming.connectors.kinesis.serialization.KinesisDeserializationSchema;
import org.apache.log4j.LogManager;
import org.apache.log4j.Logger;
import org.json.JSONObject;

import java.io.IOException;
import java.time.Instant;
import java.util.Calendar;
import java.util.Map;
import java.util.Properties;

public class FirehoseStreamingSinkJob {
    private static String region = "";
    private static String inputStreamName = "";
    private static String firehoseStreamName = "";
    private static final Logger logger = LogManager.getLogger(FirehoseStreamingSinkJob.class);

    private static DataStream<String> createSourceFromStaticConfig(StreamExecutionEnvironment env) {

        Properties inputProperties = new Properties();
        inputProperties.setProperty(ConsumerConfigConstants.AWS_REGION, region);
        inputProperties.setProperty(ConsumerConfigConstants.STREAM_INITIAL_POSITION, "LATEST");
        return env.addSource(new FlinkKinesisConsumer<>(inputStreamName, new CustomKinesisDeserializer(), inputProperties));
    }

    private static FlinkKinesisFirehoseProducer<String> createFirehoseSinkFromStaticConfig() {
        /*
         * com.amazonaws.services.kinesisanalytics.flink.connectors.config.ProducerConfigConstants
         * lists of all of the properties that firehose sink can be configured with.
         */

        Properties outputProperties = new Properties();
        outputProperties.setProperty(ConsumerConfigConstants.AWS_REGION, region);

        FlinkKinesisFirehoseProducer<String> sink = new FlinkKinesisFirehoseProducer<>(firehoseStreamName, new SimpleStringSchema(), outputProperties);
        return sink;
    }

    public static void main(String[] args) throws Exception {
        Map<String, Properties> applicationProperties = KinesisAnalyticsRuntime.getApplicationProperties();
        Properties consumerProperties = applicationProperties.get("FlinkApplicationProperties");
        region = consumerProperties.getProperty("Region","us-west-2");
        inputStreamName = consumerProperties.getProperty("InputKinesisStream");
        firehoseStreamName = consumerProperties.getProperty("FirehoseStreamName");

        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        DataStream<String> input = createSourceFromStaticConfig(env);

        input.addSink(createFirehoseSinkFromStaticConfig());

        env.execute("Flink Firehose Streaming Sink Job");
    }
}

class CustomKinesisDeserializer implements KinesisDeserializationSchema<String> {

    private static final Logger logger = LogManager.getLogger(CustomKinesisDeserializer.class);
    @Override
    public String deserialize(byte[] bytes, String partitionKey, String seqNum,
                              long approxArrivalTimeStamp, String stream, String shardId) throws IOException {
        String s = new String(bytes);
        Instant instant = Instant.now();
        JSONObject json = new JSONObject(s);
        json.put("TenantId", partitionKey);
        json.put("timestamp", instant.getEpochSecond());
        return json.toString() + "\n";
    }

    @Override
    public TypeInformation<String> getProducedType() {
        return TypeInformation.of(String.class);
    }

}
