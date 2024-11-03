use scripting additions
use framework "Foundation"

tell application "Mail"
    set emailData to {}
    
    -- Get messages (this line will be modified by the TypeScript bridge based on options)
    set targetMessages to messages of inbox
    
    repeat with theMessage in targetMessages
        -- Build message data structure
        set messageData to {|id|:id of theMessage, ¬
                          subject:subject of theMessage, ¬
                          sender:sender of theMessage, ¬
                          dateSent:date sent of theMessage, ¬
                          dateReceived:date received of theMessage, ¬
                          content:content of theMessage, ¬
                          wasRepliedTo:was replied to of theMessage, ¬
                          flagIndex:flag index of theMessage}
        
        -- Get recipients
        set recipientList to {}
        repeat with recipient in to recipients of theMessage
            copy (address of recipient) to end of recipientList
        end repeat
        set messageData's |recipients| to recipientList
        
        -- Get attachments
        set attachmentList to {}
        repeat with theAttachment in mail attachments of theMessage
            set attachmentData to {name:name of theAttachment, ¬
                                 path:path of theAttachment}
            copy attachmentData to end of attachmentList
        end repeat
        set messageData's attachments to attachmentList
        
        -- Add to collection
        copy messageData to end of emailData
    end repeat
    
    -- Convert to JSON
    set jsonString to convertToJSON(emailData)
    return jsonString
end tell

-- Helper handler to convert to JSON
on convertToJSON(theData)
    set tempPath to "/tmp/temp_data.plist"
    set theList to theData as list
    set plistData to current application's NSArray's arrayWithArray:theList
    set plistData to plistData's description as text
    do shell script "echo " & quoted form of plistData & " > " & quoted form of tempPath
    set jsonData to do shell script "plutil -convert json " & quoted form of tempPath & " -o - "
    do shell script "rm " & quoted form of tempPath
    return jsonData
end convertToJSON