package com.smartwater;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.security.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.smartwater.Store.*;
@Service
public class TelemetryService {
 final Store db; public TelemetryService(Store db){this.db=db;}
 public record Reading(@NotBlank @Size(max=120) String sampleId,@NotBlank @Size(max=80) String deviceId,@NotBlank @Size(max=40) String metricKey,Double value,@NotBlank @Size(max=30) String unit,@NotBlank String quality,@NotBlank String source,@NotNull Instant observedAt){}
 public record Batch(@NotBlank String scenario,@NotEmpty @Size(max=1000) List<@Valid Reading> readings){}
 static String hash(String body){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 static void key(String value){if(value==null||!value.matches("[A-Za-z0-9_.:-]{1,100}"))throw ApiFailure.bad("IDEMPOTENCY_KEY_REQUIRED","需要 1–100 字符的有效 Idempotency-Key");}
 @Transactional
 public Map<String,Object> ingest(Batch batch,String key,String actor){
  key(key);if(!List.of("NORMAL","LOW_DO","MISSING_DATA").contains(batch.scenario()))throw ApiFailure.bad("INVALID_SCENARIO","采集场景无效");
  db.lockRevision();String fingerprint=hash(db.encode(batch));var old=db.rows("SELECT * FROM ingestion WHERE actor=? AND idempotency_key=?",actor,key);
  if(!old.isEmpty()){if(!old.get(0).get("payload_hash").equals(fingerprint))throw new ApiFailure(409,"IDEMPOTENCY_CONFLICT","同一幂等键不能用于不同数据");return db.decode(old.get(0).get("response"));}
  for(var reading:batch.readings())validate(reading);
  long revision=db.nextRevision();int inserted=0,duplicates=0;var sorted=new ArrayList<>(batch.readings());sorted.sort(Comparator.comparing(Reading::observedAt).thenComparing(Reading::deviceId).thenComparing(Reading::metricKey));
  for(var r:sorted){
   var existing=db.rows("SELECT * FROM telemetry WHERE sample_id=? OR (device_id=? AND metric_key=? AND source=? AND observed_at=?)",r.sampleId(),r.deviceId(),r.metricKey(),r.source(),r.observedAt().atOffset(ZoneOffset.UTC));
   if(!existing.isEmpty()){for(var row:existing)if(!same(row,r))throw new ApiFailure(409,"SAMPLE_CONFLICT","采样标识或时刻已存在不同内容；历史数据未覆盖");duplicates++;continue;}
   UUID id=UUID.randomUUID();db.jdbc.update("INSERT INTO telemetry VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,r.sampleId(),r.deviceId(),r.metricKey(),r.value(),r.unit(),r.quality(),r.source(),r.observedAt().atOffset(ZoneOffset.UTC),OffsetDateTime.now(ZoneOffset.UTC),revision);inserted++;
   var current=db.rows("SELECT * FROM metric_state WHERE device_id=? AND metric_key=?",r.deviceId(),r.metricKey());
   if(!current.isEmpty()&&instant(current.get(0).get("observed_at")).isAfter(r.observedAt()))continue;
   db.jdbc.update("INSERT INTO metric_state VALUES(?,?,?,?) ON CONFLICT(device_id,metric_key) DO UPDATE SET observed_at=EXCLUDED.observed_at,telemetry_id=EXCLUDED.telemetry_id",r.deviceId(),r.metricKey(),r.observedAt().atOffset(ZoneOffset.UTC),id);evaluate(r,id,revision);
  }
  db.jdbc.update("UPDATE dataset_state SET scenario=? WHERE id=1",batch.scenario());UUID id=UUID.randomUUID();var result=map("batchId",id.toString(),"revision",revision,"inserted",inserted,"duplicates",duplicates,"source","SIMULATED");
  db.jdbc.update("INSERT INTO ingestion VALUES(?,?,?,?,?,?::jsonb,?)",id,actor,key,fingerprint,revision,db.encode(result),OffsetDateTime.now(ZoneOffset.UTC));db.audit(actor,"TELEMETRY_INGEST",id.toString(),result);return result;
 }
 private boolean same(Map<String,Object> row,Reading r){return row.get("device_id").equals(r.deviceId())&&row.get("metric_key").equals(r.metricKey())&&row.get("unit").equals(r.unit())&&row.get("quality").equals(r.quality())&&row.get("source").equals(r.source())&&instant(row.get("observed_at")).equals(r.observedAt())&&Objects.equals(row.get("value"),r.value());}
 private void validate(Reading r){
  var defs=db.rows("SELECT * FROM metric_definition WHERE device_id=? AND key=?",r.deviceId(),r.metricKey());if(defs.isEmpty())throw ApiFailure.bad("METRIC_NOT_OWNED","设备或指标不在台账定义中");var definition=defs.get(0);
  if(!definition.get("unit").equals(r.unit()))throw ApiFailure.bad("UNIT_MISMATCH","单位必须与指标定义一致");
  if(!r.source().equals("SIMULATED"))throw ApiFailure.bad("SOURCE_NOT_SUPPORTED","当前采集接口仅接收 SIMULATED 来源");
  if(!List.of("GOOD","MISSING","STALE").contains(r.quality())||(r.quality().equals("MISSING")?r.value()!=null:r.value()==null||!Double.isFinite(r.value())))throw ApiFailure.bad("INVALID_QUALITY_VALUE","缺测必须为 null，有效或过期数值必须有限");
  if(r.value()!=null&&(r.value()<((Number)definition.get("minimum")).doubleValue()||r.value()>((Number)definition.get("maximum")).doubleValue()))throw ApiFailure.bad("OUT_OF_RANGE","数值超出本项目指标的演示范围");
  if(r.observedAt().isAfter(Instant.now().plusSeconds(30))||r.observedAt().isBefore(Instant.parse("2000-01-01T00:00:00Z")))throw ApiFailure.bad("INVALID_OBSERVED_TIME","观测时间超出允许范围");
 }
 private void evaluate(Reading r,UUID reading,long revision){
  for(var rule:db.rows("SELECT * FROM alarm_rule WHERE device_id=? AND metric_key=?",r.deviceId(),r.metricKey())){
   var active=db.rows("SELECT * FROM alarm WHERE device_id=? AND rule_id=? AND state='ACTIVE'",r.deviceId(),rule.get("id"));
   if(!r.quality().equals("GOOD")){if(!active.isEmpty()){UUID id=(UUID)active.get(0).get("id");db.jdbc.update("UPDATE alarm SET quality=?,last_reading_id=? WHERE id=?",r.quality(),reading,id);db.alarmEvent(id,revision,"DATA_UNCERTAIN");}continue;}
   boolean low=r.value()<((Number)rule.get("threshold")).doubleValue();
   if(low&&active.isEmpty()){
    UUID id=UUID.randomUUID();db.jdbc.update("INSERT INTO alarm(id,device_id,metric_key,rule_id,rule_version,rule_label,threshold,state,occurred_at,trigger_value,trigger_reading_id,last_reading_id,quality,occurrence_count,source) VALUES(?,?,?,?,?,?,?,'ACTIVE',?,?,?,?, 'GOOD',1,'SIMULATED')",id,r.deviceId(),r.metricKey(),rule.get("id"),rule.get("version"),rule.get("label"),rule.get("threshold"),r.observedAt().atOffset(ZoneOffset.UTC),r.value(),reading,reading);db.alarmEvent(id,revision,"TRIGGERED");
   }else if(!active.isEmpty()){
    UUID id=(UUID)active.get(0).get("id");if(low){db.jdbc.update("UPDATE alarm SET occurrence_count=occurrence_count+1,last_reading_id=?,quality='GOOD' WHERE id=?",reading,id);db.alarmEvent(id,revision,"PERSISTED");}
    else {db.jdbc.update("UPDATE alarm SET state='RECOVERED',recovered_at=?,last_reading_id=?,quality='GOOD' WHERE id=?",r.observedAt().atOffset(ZoneOffset.UTC),reading,id);db.alarmEvent(id,revision,"RECOVERED");}
   }
  }
 }
}
