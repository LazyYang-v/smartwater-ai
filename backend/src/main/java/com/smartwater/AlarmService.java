package com.smartwater;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.smartwater.Store.*;
@Service
public class AlarmService {
 final Store db;public AlarmService(Store db){this.db=db;}
 @Transactional
 public Map<String,Object> command(String id,String action,String note,String key,String actor){
  TelemetryService.key(key);if(note==null||note.isBlank()||note.length()>500)throw ApiFailure.bad("REASON_REQUIRED","需要1–500字符的处理说明");UUID uuid;try{uuid=UUID.fromString(id);}catch(IllegalArgumentException e){throw ApiFailure.bad("INVALID_ALARM","告警ID无效");}
  db.lockRevision();String fingerprint=TelemetryService.hash(db.encode(map("id",id,"action",action,"note",note)));var previous=db.rows("SELECT * FROM command_receipt WHERE actor=? AND idempotency_key=?",actor,key);if(!previous.isEmpty()){if(!previous.get(0).get("payload_hash").equals(fingerprint))throw new ApiFailure(409,"IDEMPOTENCY_CONFLICT","幂等键对应不同操作");return db.decode(previous.get(0).get("response"));}
  var row=db.one("SELECT * FROM alarm WHERE id=? FOR UPDATE",uuid);long revision;
  if(action.equals("acknowledge")){
   if(row.get("state").equals("CLOSED"))throw new ApiFailure(409,"ALARM_ALREADY_CLOSED","已关闭告警不能确认");
   if(row.get("acknowledged_at")==null){revision=db.nextRevision();db.jdbc.update("UPDATE alarm SET acknowledged_at=?,acknowledged_by=? WHERE id=?",OffsetDateTime.now(ZoneOffset.UTC),actor,uuid);db.alarmEvent(uuid,revision,"ACKNOWLEDGED");}
  }else if(action.equals("close")){
   if(!row.get("state").equals("CLOSED")){
    if(!row.get("state").equals("RECOVERED")||row.get("acknowledged_at")==null)throw new ApiFailure(409,"INVALID_ALARM_TRANSITION","必须先恢复且人工确认，才能关闭告警");
    revision=db.nextRevision();db.jdbc.update("UPDATE alarm SET state='CLOSED',closed_at=?,closed_by=? WHERE id=?",OffsetDateTime.now(ZoneOffset.UTC),actor,uuid);db.alarmEvent(uuid,revision,"CLOSED");}
  }else throw ApiFailure.bad("INVALID_ACTION","不支持的告警操作");
  var result=db.alarm(db.one("SELECT * FROM alarm WHERE id=?",uuid));db.audit(actor,"ALARM_"+action.toUpperCase(Locale.ROOT),id,map("reason",note,"result",result));db.jdbc.update("INSERT INTO command_receipt VALUES(?,?,?,?::jsonb)",actor,key,fingerprint,db.encode(result));return result;
 }
}
