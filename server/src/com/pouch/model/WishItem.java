package com.pouch.model;

public class WishItem {
    private String id;
    private String name;
    private long amountCents;      // 分为单位，见 01 §1.5.2
    private String note = "";
    private boolean purchased = false;
    private String purchasedAt;    // 未购为 null
    private String createdAt;
    private String updatedAt;
    private int sortIndex = 0;

    public WishItem() {}

    public String id()           { return id; }
    public String name()         { return name; }
    public long amountCents()    { return amountCents; }
    public String note()         { return note; }
    public boolean purchased()   { return purchased; }
    public String purchasedAt()  { return purchasedAt; }
    public String createdAt()    { return createdAt; }
    public String updatedAt()    { return updatedAt; }
    public int sortIndex()       { return sortIndex; }

    public void setId(String v)          { id = v; }
    public void setName(String v)        { name = v; }
    public void setAmountCents(long v)   { amountCents = v; }
    public void setNote(String v)        { note = v; }
    public void setPurchased(boolean v)  { purchased = v; }
    public void setPurchasedAt(String v) { purchasedAt = v; }
    public void setCreatedAt(String v)   { createdAt = v; }
    public void setUpdatedAt(String v)   { updatedAt = v; }
    public void setSortIndex(int v)      { sortIndex = v; }
}
