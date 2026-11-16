package com.smartwater;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
@Component
public class Store {
 final JdbcTemplate jdbc; final ObjectMapper json;
 public Store(JdbcTemplate jdbc,ObjectMapper json){this.jdbc=jdbc;this.json=json;}
 static Map<String,Object> map(Object...pairs){var result=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)result.put((String)pairs[i],pairs[i+1]);return result;}
 String encode(Object value){return json.writeValueAsString(value);}
 @SuppressWarnings("unchecked") Map<String,Object> decode(Object value){return json.readValue(value.toString(),Map.class);}
 List<Map<String,Object>> rows(String sql,Object...args){return jdbc.queryForList(sql,args);}
 Map<String,Object> one(String sql,Object...args){var rows=rows(sql,args);if(rows.isEmpty())throw new ApiFailure(404,"NOT_FOUND","业务记录不存在");return rows.get(0);}
 long lockRevision(){return ((Number)one("SELECT revision FROM dataset_state WHERE id=1 FOR UPDATE").get("revision")).longValue();}
 long nextRevision(){long next=lockRevision()+1;jdbc.update("UPDATE dataset_state SET revision=? WHERE id=1",next);return next;}
 void audit(String actor,String action,String id,Object detail){jdbc.update("INSERT INTO audit_event VALUES(?,?,?,?,?::jsonb,?)",UUID.randomUUID(),actor,action,id,encode(detail),OffsetDateTime.now(ZoneOffset.UTC));}
 static Instant instant(Object value){return value instanceof java.sql.Timestamp t?t.toInstant():value instanceof OffsetDateTime t?t.toInstant():Instant.parse(value.toString());}
 static String iso(Object value){return value==null?null:instant(value).toString();}
 Map<String,Object> alarm(Map<String,Object> row){return map("alarmId",row.get("id").toString(),"deviceId",row.get("device_id"),"metricKey",row.get("metric_key"),"occurredAt",iso(row.get("occurred_at")),"level","WARNING","ruleId",row.get("rule_id"),"ruleVersion",row.get("rule_version"),"rule",row.get("rule_label"),"threshold",row.get("threshold"),"lifecycleStatus",row.get("state"),"status",row.get("state").equals("ACTIVE")?(!row.get("quality").equals("GOOD")?"AWAITING_DATA":row.get("acknowledged_at")!=null?"ACKNOWLEDGED":"ACTIVE"):row.get("state"),"source",row.get("source"),"valueAtEvent",row.get("trigger_value"),"triggerReadingId",row.get("trigger_reading_id").toString(),"eventQuality","GOOD","lastReadingId",row.get("last_reading_id").toString(),"quality",row.get("quality"),"acknowledgedAt",iso(row.get("acknowledged_at")),"acknowledgedBy",row.get("acknowledged_by"),"recoveredAt",iso(row.get("recovered_at")),"closedAt",iso(row.get("closed_at")),"closedBy",row.get("closed_by"),"occurrenceCount",row.get("occurrence_count"));}
 void alarmEvent(UUID id,long revision,String event){var payload=alarm(one("SELECT * FROM alarm WHERE id=?",id));jdbc.update("INSERT INTO alarm_event(alarm_id,revision,event_type,payload,recorded_at) VALUES(?,?,?,?::jsonb,?)",id,revision,event,encode(payload),OffsetDateTime.now(ZoneOffset.UTC));}
}
